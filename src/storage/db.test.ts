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
