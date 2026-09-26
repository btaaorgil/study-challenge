import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createStorageLayer } from "./db";
import type { Lesson } from "../domain/types";

let dbCounter = 0;
function freshDbName(): string {
  dbCounter += 1;
  return `failure-test-db-${dbCounter}`;
}

const sampleLesson: Lesson = {
  id: "lesson-1",
  title: "Sample",
  sections: [
    {
      id: "s0",
      title: "A",
      explanation: "a",
      concepts: [{ id: "c0", text: "t", explanation: "e", sourceQuote: "t" }],
    },
    {
      id: "s1",
      title: "B",
      explanation: "b",
      concepts: [{ id: "c1", text: "t", explanation: "e", sourceQuote: "t" }],
    },
    {
      id: "s2",
      title: "C",
      explanation: "c",
      concepts: [{ id: "c2", text: "t", explanation: "e", sourceQuote: "t" }],
    },
    {
      id: "s3",
      title: "D",
      explanation: "d",
      concepts: [{ id: "c3", text: "t", explanation: "e", sourceQuote: "t" }],
    },
  ],
};

/**
 * Minimal fake IDBOpenDBRequest-shaped object that lets tests trigger a
 * specific outcome (blocked/error) deterministically, without depending on
 * fake-indexeddb's real (hard to trigger reliably) blocking semantics.
 */
interface FakeOpenRequest {
  onupgradeneeded: ((event: IDBVersionChangeEvent) => unknown) | null;
  onsuccess: ((event: Event) => unknown) | null;
  onerror: ((event: Event) => unknown) | null;
  onblocked: ((event: Event) => unknown) | null;
  error: DOMException | null;
  result?: IDBDatabase;
}

function createControlledOpenRequest(): {
  request: FakeOpenRequest;
  triggerBlocked: () => void;
  triggerError: (error: unknown) => void;
} {
  const request: FakeOpenRequest = {
    onupgradeneeded: null,
    onsuccess: null,
    onerror: null,
    onblocked: null,
    error: null,
  };
  return {
    request,
    triggerBlocked: () => {
      queueMicrotask(() => request.onblocked?.(new Event("blocked")));
    },
    triggerError: (error: unknown) => {
      request.error = error as DOMException;
      queueMicrotask(() => request.onerror?.(new Event("error")));
    },
  };
}

function factoryThatBlocks(): IDBFactory {
  const { request, triggerBlocked } = createControlledOpenRequest();
  triggerBlocked();
  return { open: () => request } as unknown as IDBFactory;
}

function factoryThatErrorsWith(error: unknown): IDBFactory {
  const { request, triggerError } = createControlledOpenRequest();
  triggerError(error);
  return { open: () => request } as unknown as IDBFactory;
}

describe("Storage_Layer IndexedDB failure modes (Requirements 9.3, 9.4)", () => {
  it("degrades to 'unsupported' when no IndexedDB factory is available", async () => {
    const { storage, getStatus } = createStorageLayer(undefined, freshDbName());

    expect(getStatus()).toEqual({ kind: "ok" });
    await storage.init();

    expect(getStatus()).toMatchObject({ kind: "degraded", reason: "unsupported" });

    // The user can still complete the day's challenge using in-memory data (Req 9.4).
    await storage.putLesson(sampleLesson);
    await expect(storage.getLesson(sampleLesson.id)).resolves.toEqual(sampleLesson);
  });

  it("degrades to 'blocked' when the open request is blocked", async () => {
    const { storage, getStatus } = createStorageLayer(factoryThatBlocks(), freshDbName());
    await storage.init();

    expect(getStatus()).toMatchObject({ kind: "degraded", reason: "blocked" });

    await storage.putLesson(sampleLesson);
    await expect(storage.getLesson(sampleLesson.id)).resolves.toEqual(sampleLesson);
  });

  it("degrades to 'quota-exceeded' when the open request errors with QuotaExceededError", async () => {
    const quotaError = new DOMException("Quota exceeded", "QuotaExceededError");
    const { storage, getStatus } = createStorageLayer(
      factoryThatErrorsWith(quotaError),
      freshDbName(),
    );
    await storage.init();

    expect(getStatus()).toMatchObject({ kind: "degraded", reason: "quota-exceeded" });

    await storage.putLesson(sampleLesson);
    await expect(storage.getLesson(sampleLesson.id)).resolves.toEqual(sampleLesson);
  });

  it("degrades to 'quota-exceeded' when a write throws QuotaExceededError after a successful open", async () => {
    // A factory whose `open` delegates to a real fake-indexeddb factory, but
    // patches the resulting IDBDatabase so every `transaction()` call throws
    // QuotaExceededError -- exercising db.ts's actual write-failure path
    // (the `withFallback` try/catch around `db.transaction(...)`).
    const realFactory = new IDBFactory();
    const quotaExceededFactory: IDBFactory = {
      open: (name: string, version?: number) => {
        const request = realFactory.open(name, version);
        request.addEventListener("success", () => {
          vi.spyOn(request.result, "transaction").mockImplementation(() => {
            throw new DOMException("Quota exceeded", "QuotaExceededError");
          });
        });
        return request;
      },
    } as unknown as IDBFactory;

    const dbName = freshDbName();
    const { storage, getStatus } = createStorageLayer(quotaExceededFactory, dbName);
    // init() itself now performs a write (seeding SAMPLE_LESSON if no other
    // lesson qualifies), so with every transaction() patched to throw, the
    // very first write already triggers degradation during init().
    await storage.init();
    expect(getStatus()).toMatchObject({ kind: "degraded", reason: "quota-exceeded" });

    // The write fails and is classified as quota-exceeded, then transparently
    // falls back to the in-memory adapter so the caller still succeeds (Req 9.4).
    await storage.putLesson(sampleLesson);
    expect(getStatus()).toMatchObject({ kind: "degraded", reason: "quota-exceeded" });
    await expect(storage.getLesson(sampleLesson.id)).resolves.toEqual(sampleLesson);
  });
});

describe("Storage_Layer write-then-read ordering (Requirement 9.1)", () => {
  it("resolves putLesson only after the write is durably committed and readable", async () => {
    const { storage } = createStorageLayer(new IDBFactory(), freshDbName());
    await storage.init();

    await storage.putLesson(sampleLesson);
    const loaded = await storage.getLesson(sampleLesson.id);
    expect(loaded).toEqual(sampleLesson);
  });

  it("persists an attempt such that it is immediately visible to getAttempts", async () => {
    const { storage } = createStorageLayer(new IDBFactory(), freshDbName());
    await storage.init();

    const attempt = {
      id: "2025-01-15:q1:1000",
      dateKey: "2025-01-15",
      questionId: "q1",
      selectedOptionId: "opt1",
      isCorrect: true,
      submittedAt: 1000,
    };
    await storage.putAttempt(attempt);
    const attempts = await storage.getAttempts("2025-01-15");
    expect(attempts).toEqual([attempt]);
  });
});

describe("Storage_Layer listDailyChallenges (Study Calendar support)", () => {
  it("returns every persisted Daily_Challenge", async () => {
    const { storage } = createStorageLayer(new IDBFactory(), freshDbName());
    await storage.init();

    const challengeA = { dateKey: "2025-01-15", lessonId: "lesson-1", questions: [] };
    const challengeB = { dateKey: "2025-01-16", lessonId: "lesson-1", questions: [] };
    await storage.putDailyChallenge(challengeA);
    await storage.putDailyChallenge(challengeB);

    const all = await storage.listDailyChallenges();
    expect(all).toHaveLength(2);
    expect(all).toEqual(
      expect.arrayContaining([challengeA, challengeB]),
    );
  });

  it("returns an empty array when nothing has been persisted", async () => {
    const { storage } = createStorageLayer(new IDBFactory(), freshDbName());
    await storage.init();
    await expect(storage.listDailyChallenges()).resolves.toEqual([]);
  });
});

describe("Storage_Layer active-lesson-id pointer (Add Lesson support)", () => {
  it("returns undefined before it has ever been set", async () => {
    const { storage } = createStorageLayer(new IDBFactory(), freshDbName());
    await storage.init();
    await expect(storage.getActiveLessonId()).resolves.toBeUndefined();
  });

  it("persists and round-trips a set active lesson id", async () => {
    const { storage } = createStorageLayer(new IDBFactory(), freshDbName());
    await storage.init();

    await storage.setActiveLessonId("custom-lesson-42");
    await expect(storage.getActiveLessonId()).resolves.toBe("custom-lesson-42");
  });

  it("survives across separate StorageLayer instances against the same underlying database", async () => {
    const factory = new IDBFactory();
    const dbName = freshDbName();

    const { storage: writer } = createStorageLayer(factory, dbName);
    await writer.init();
    await writer.setActiveLessonId("custom-lesson-99");

    const { storage: reader } = createStorageLayer(factory, dbName);
    await reader.init();
    await expect(reader.getActiveLessonId()).resolves.toBe("custom-lesson-99");
  });

  it("also works via the in-memory fallback adapter when degraded", async () => {
    const { storage } = createStorageLayer(undefined, freshDbName());
    await storage.init(); // degrades to unsupported

    await storage.setActiveLessonId("in-memory-lesson");
    await expect(storage.getActiveLessonId()).resolves.toBe("in-memory-lesson");
  });
});

describe("Storage_Layer schema v2 migration (meta store)", () => {
  it("adds the meta store when upgrading a v1 database that predates it", async () => {
    const factory = new IDBFactory();
    const dbName = freshDbName();

    // Manually open at version 1 to simulate a pre-existing v1 database,
    // mirroring the v1 schema (lessons, dailyChallenges, attempts only).
    await new Promise<void>((resolve, reject) => {
      const request = factory.open(dbName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("lessons", { keyPath: "id" });
        db.createObjectStore("dailyChallenges", { keyPath: "dateKey" });
        const attempts = db.createObjectStore("attempts", { keyPath: "id" });
        attempts.createIndex("by_dateKey", "dateKey");
        attempts.createIndex("by_question", ["dateKey", "questionId"]);
      };
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });

    // Now open through the real Storage_Layer (current DB_VERSION, 2+),
    // which must run the v2 upgrade step and add the `meta` store without
    // disturbing the pre-existing v1 stores/data.
    const { storage, getStatus } = createStorageLayer(factory, dbName);
    await storage.init();
    expect(getStatus()).toEqual({ kind: "ok" });

    // The active-lesson-id pointer (backed by `meta`) works post-migration.
    await storage.setActiveLessonId("post-migration-lesson");
    await expect(storage.getActiveLessonId()).resolves.toBe("post-migration-lesson");
  });
});
