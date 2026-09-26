// Storage_Layer: the sole IndexedDB access point (steering: storage.md).
// See design.md: "Storage_Layer (src/storage/db.ts)", "Schema", "Error handling / fallback".
// Requirements: 9.1 (persist before operation completes), 9.2 (sole access point),
// 9.3/9.4 (graceful degradation to in-memory on unsupported/blocked/quota-exceeded).

import type { Attempt, DailyChallenge, Lesson } from "../domain/types";
import { validateLesson } from "../domain/lesson";
import { SAMPLE_LESSON } from "../data/sampleLesson";

const DB_NAME = "daily-challenge-db";
const DB_VERSION = 2;

const STORE_LESSONS = "lessons";
const STORE_DAILY_CHALLENGES = "dailyChallenges";
const STORE_ATTEMPTS = "attempts";
const STORE_META = "meta";
const INDEX_BY_DATE_KEY = "by_dateKey";
const INDEX_BY_QUESTION = "by_question";
const META_ACTIVE_LESSON_ID_KEY = "activeLessonId";

export interface StorageLayer {
  init(): Promise<void>; // opens/upgrades the DB, seeds Sample_Lesson if absent

  getLesson(id: string): Promise<Lesson | undefined>;
  putLesson(lesson: Lesson): Promise<void>;
  listLessons(): Promise<Lesson[]>;

  getDailyChallenge(dateKey: string): Promise<DailyChallenge | undefined>;
  putDailyChallenge(challenge: DailyChallenge): Promise<void>;
  /** All persisted Daily_Challenges, in no particular order (used by the Study Calendar). */
  listDailyChallenges(): Promise<DailyChallenge[]>;

  getAttempts(dateKey: string): Promise<Attempt[]>;
  putAttempt(attempt: Attempt): Promise<void>;

  /** The id of the lesson the user most recently chose as active (e.g. via Add Lesson), if any. */
  getActiveLessonId(): Promise<string | undefined>;
  setActiveLessonId(lessonId: string): Promise<void>;
}

export type StorageDegradedReason = "unsupported" | "blocked" | "quota-exceeded";

export type StorageStatus =
  | { kind: "ok" }
  | { kind: "degraded"; reason: StorageDegradedReason; message: string };

// ---------------------------------------------------------------------------
// Schema / versioning
// ---------------------------------------------------------------------------

// v1 (2025-01): initial stores — lessons, dailyChallenges, attempts
// v2 (2025-02): added `meta` key-value store (keyPath "key") for small
//   singleton values like the active-lesson-id pointer used by the
//   "Add Lesson" importer feature.
function runUpgrade(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    db.createObjectStore(STORE_LESSONS, { keyPath: "id" });
    db.createObjectStore(STORE_DAILY_CHALLENGES, { keyPath: "dateKey" });
    const attempts = db.createObjectStore(STORE_ATTEMPTS, { keyPath: "id" });
    attempts.createIndex(INDEX_BY_DATE_KEY, "dateKey");
    attempts.createIndex(INDEX_BY_QUESTION, ["dateKey", "questionId"]);
  }
  if (oldVersion < 2) {
    db.createObjectStore(STORE_META, { keyPath: "key" });
  }
  // v3+ upgrades appended here, guarded by `if (oldVersion < N)`
}

// ---------------------------------------------------------------------------
// Low-level error classification
// ---------------------------------------------------------------------------

class IndexedDbBlockedError extends Error {
  constructor(message = "IndexedDB open request was blocked by another connection.") {
    super(message);
    this.name = "IndexedDbBlockedError";
  }
}

class IndexedDbQuotaExceededError extends Error {
  constructor(message = "IndexedDB storage quota was exceeded.") {
    super(message);
    this.name = "IndexedDbQuotaExceededError";
  }
}

function isQuotaExceededError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "QuotaExceededError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: unknown }).name === "QuotaExceededError")
  );
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Classifies a failure from opening the database into one of the three
 * degraded reasons. `QuotaExceededError` and our own IndexedDbBlockedError
 * marker are classified precisely; any other unexpected open failure is
 * conservatively classified as "blocked" (something prevented the connection)
 * since the StorageStatus reason enum has no generic "error" case.
 */
function classifyOpenError(error: unknown): StorageDegradedReason {
  if (error instanceof IndexedDbBlockedError) return "blocked";
  if (error instanceof IndexedDbQuotaExceededError || isQuotaExceededError(error)) {
    return "quota-exceeded";
  }
  return "blocked";
}

/** Classifies a failure from a read/write operation performed after open. */
function classifyOperationError(error: unknown): StorageDegradedReason {
  if (isQuotaExceededError(error)) return "quota-exceeded";
  return "blocked";
}

// ---------------------------------------------------------------------------
// Promise helpers over the native IndexedDB request/transaction model
// ---------------------------------------------------------------------------

function openDatabase(factory: IDBFactory, dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const request = factory.open(dbName, DB_VERSION);

    request.onupgradeneeded = (event) => {
      runUpgrade(request.result, event.oldVersion);
    };

    request.onsuccess = () => {
      if (settled) return;
      settled = true;
      resolve(request.result);
    };

    request.onerror = () => {
      if (settled) return;
      settled = true;
      const err = request.error;
      if (err && isQuotaExceededError(err)) {
        reject(new IndexedDbQuotaExceededError(err.message));
      } else {
        reject(err ?? new Error("IndexedDB open failed"));
      }
    };

    request.onblocked = () => {
      if (settled) return;
      settled = true;
      reject(new IndexedDbBlockedError());
    };
  });
}

function promisifyRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

/**
 * Runs a put against `storeName` and resolves only once the surrounding
 * transaction *completes* (commits) rather than merely once the individual
 * put request succeeds — satisfying Requirement 9.1 ("persist the change to
 * IndexedDB before the triggering operation is considered complete").
 */
function putRecord(db: IDBDatabase, storeName: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = db.transaction(storeName, "readwrite");
    } catch (err) {
      reject(err);
      return;
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Transaction failed"));
    tx.onabort = () => reject(tx.error ?? new Error("Transaction aborted"));

    try {
      tx.objectStore(storeName).put(value);
    } catch (err) {
      reject(err);
    }
  });
}

function getRecord<T>(
  db: IDBDatabase,
  storeName: string,
  key: IDBValidKey,
): Promise<T | undefined> {
  const tx = db.transaction(storeName, "readonly");
  const request = tx.objectStore(storeName).get(key) as IDBRequest<T | undefined>;
  return promisifyRequest(request);
}

function getAllRecords<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  const tx = db.transaction(storeName, "readonly");
  const request = tx.objectStore(storeName).getAll() as IDBRequest<T[]>;
  return promisifyRequest(request);
}

function getAllByIndex<T>(
  db: IDBDatabase,
  storeName: string,
  indexName: string,
  key: IDBValidKey,
): Promise<T[]> {
  const tx = db.transaction(storeName, "readonly");
  const request = tx.objectStore(storeName).index(indexName).getAll(key) as IDBRequest<T[]>;
  return promisifyRequest(request);
}

// ---------------------------------------------------------------------------
// In-memory fallback adapter
// ---------------------------------------------------------------------------

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createInMemoryStorageLayer(): StorageLayer {
  const lessons = new Map<string, Lesson>();
  const dailyChallenges = new Map<string, DailyChallenge>();
  const attemptsByDateKey = new Map<string, Attempt[]>();
  let activeLessonId: string | undefined;

  return {
    async init() {
      // No-op: the in-memory adapter has nothing to open/upgrade.
    },
    async getLesson(id) {
      const lesson = lessons.get(id);
      return lesson ? clone(lesson) : undefined;
    },
    async putLesson(lesson) {
      lessons.set(lesson.id, clone(lesson));
    },
    async listLessons() {
      return Array.from(lessons.values()).map(clone);
    },
    async getDailyChallenge(dateKey) {
      const challenge = dailyChallenges.get(dateKey);
      return challenge ? clone(challenge) : undefined;
    },
    async putDailyChallenge(challenge) {
      dailyChallenges.set(challenge.dateKey, clone(challenge));
    },
    async listDailyChallenges() {
      return Array.from(dailyChallenges.values()).map(clone);
    },
    async getAttempts(dateKey) {
      return (attemptsByDateKey.get(dateKey) ?? []).map(clone);
    },
    async putAttempt(attempt) {
      const existing = attemptsByDateKey.get(attempt.dateKey) ?? [];
      existing.push(clone(attempt));
      attemptsByDateKey.set(attempt.dateKey, existing);
    },
    async getActiveLessonId() {
      return activeLessonId;
    },
    async setActiveLessonId(lessonId) {
      activeLessonId = lessonId;
    },
  };
}

// ---------------------------------------------------------------------------
// Composite Storage_Layer: IndexedDB-backed, with transparent in-memory
// fallback on unsupported / blocked / quota-exceeded conditions.
// ---------------------------------------------------------------------------

export interface CreateStorageLayerResult {
  storage: StorageLayer;
  getStatus(): StorageStatus;
}

/**
 * Resolves the global `indexedDB`, if any. Returns undefined in environments
 * where IndexedDB is unavailable (Req 9.3/9.4 "unsupported" case).
 */
function resolveGlobalIndexedDB(): IDBFactory | undefined {
  return typeof indexedDB === "undefined" ? undefined : indexedDB;
}

/**
 * Creates a Storage_Layer bound to the given IndexedDB factory. Pass
 * `undefined` explicitly to simulate an environment with no IndexedDB
 * support (Req 9.3/9.4 "unsupported" case). Exposed primarily so tests can
 * inject an isolated or failure-simulating factory; app code should
 * generally use the default singleton exported below, which resolves the
 * real global `indexedDB`.
 */
export function createStorageLayer(
  indexedDBFactory: IDBFactory | undefined,
  dbName: string = DB_NAME,
): CreateStorageLayerResult {
  let status: StorageStatus = { kind: "ok" };
  let db: IDBDatabase | undefined;
  const memory = createInMemoryStorageLayer();

  function degrade(reason: StorageDegradedReason, message: string): void {
    // Once degraded, stay degraded for the remainder of the session (Req 9.4):
    // every subsequent operation is served by the in-memory adapter, and we
    // never attempt to reopen or rewrite the existing IndexedDB stores, so
    // whatever was already persisted there is left untouched (Req 9.3).
    if (status.kind !== "degraded") {
      status = { kind: "degraded", reason, message };
    }
  }

  function isDegraded(): boolean {
    return status.kind === "degraded";
  }

  async function withFallback<T>(
    run: (db: IDBDatabase) => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    if (isDegraded() || !db) {
      return fallback();
    }
    try {
      return await run(db);
    } catch (err) {
      degrade(classifyOperationError(err), describeError(err));
      return fallback();
    }
  }

  const storage: StorageLayer = {
    async init() {
      if (!indexedDBFactory) {
        degrade("unsupported", "IndexedDB is not available in this environment.");
      } else {
        try {
          db = await openDatabase(indexedDBFactory, dbName);
        } catch (err) {
          degrade(classifyOpenError(err), describeError(err));
        }
      }

      // Seed the bundled Sample_Lesson if no other lesson in storage
      // validates (Req 2.1, 2.3). Idempotent: `id` is the key, so re-running
      // init() never duplicates it. Uses the fallback-aware `storage.*`
      // methods below (not the raw `db`), so this works identically whether
      // IndexedDB is available or we've already degraded to in-memory.
      const storedLessons = await storage.listLessons();
      const hasQualifyingNonSampleLesson = storedLessons.some(
        (lesson) => lesson.id !== SAMPLE_LESSON.id && validateLesson(lesson).valid,
      );
      if (!hasQualifyingNonSampleLesson) {
        await storage.putLesson(SAMPLE_LESSON);
      }
    },

    getLesson(id) {
      return withFallback(
        (database) => getRecord<Lesson>(database, STORE_LESSONS, id),
        () => memory.getLesson(id),
      );
    },

    putLesson(lesson) {
      return withFallback(
        (database) => putRecord(database, STORE_LESSONS, lesson),
        () => memory.putLesson(lesson),
      );
    },

    listLessons() {
      return withFallback(
        (database) => getAllRecords<Lesson>(database, STORE_LESSONS),
        () => memory.listLessons(),
      );
    },

    getDailyChallenge(dateKey) {
      return withFallback(
        (database) => getRecord<DailyChallenge>(database, STORE_DAILY_CHALLENGES, dateKey),
        () => memory.getDailyChallenge(dateKey),
      );
    },

    putDailyChallenge(challenge) {
      return withFallback(
        (database) => putRecord(database, STORE_DAILY_CHALLENGES, challenge),
        () => memory.putDailyChallenge(challenge),
      );
    },

    listDailyChallenges() {
      return withFallback(
        (database) => getAllRecords<DailyChallenge>(database, STORE_DAILY_CHALLENGES),
        () => memory.listDailyChallenges(),
      );
    },

    getAttempts(dateKey) {
      return withFallback(
        (database) =>
          getAllByIndex<Attempt>(database, STORE_ATTEMPTS, INDEX_BY_DATE_KEY, dateKey),
        () => memory.getAttempts(dateKey),
      );
    },

    putAttempt(attempt) {
      return withFallback(
        (database) => putRecord(database, STORE_ATTEMPTS, attempt),
        () => memory.putAttempt(attempt),
      );
    },

    getActiveLessonId() {
      return withFallback(
        async (database) => {
          const record = await getRecord<{ key: string; value: string }>(
            database,
            STORE_META,
            META_ACTIVE_LESSON_ID_KEY,
          );
          return record?.value;
        },
        () => memory.getActiveLessonId(),
      );
    },

    setActiveLessonId(lessonId) {
      return withFallback(
        (database) =>
          putRecord(database, STORE_META, { key: META_ACTIVE_LESSON_ID_KEY, value: lessonId }),
        () => memory.setActiveLessonId(lessonId),
      );
    },
  };

  return { storage, getStatus: () => status };
}

// ---------------------------------------------------------------------------
// Default app-wide singleton
// ---------------------------------------------------------------------------

const defaultInstance = createStorageLayer(resolveGlobalIndexedDB());

/** The app-wide Storage_Layer singleton. Call `storage.init()` once on startup. */
export const storage: StorageLayer = defaultInstance.storage;

/** Current storage status for the default singleton (Req 9.3/9.4). */
export function getStorageStatus(): StorageStatus {
  return defaultInstance.getStatus();
}
