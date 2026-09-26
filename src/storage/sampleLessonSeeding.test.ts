import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createStorageLayer } from "./db";
import { SAMPLE_LESSON } from "../data/sampleLesson";
import { validateLesson } from "../domain/lesson";

let dbCounter = 0;
function freshDbName(): string {
  dbCounter += 1;
  return `seed-test-db-${dbCounter}`;
}

describe("Storage_Layer.init() seeds SAMPLE_LESSON (Requirements 2.1, 2.3)", () => {
  it("seeds SAMPLE_LESSON on a fresh database with no prior lessons", async () => {
    const { storage } = createStorageLayer(new IDBFactory(), freshDbName());
    await storage.init();

    const loaded = await storage.getLesson(SAMPLE_LESSON.id);
    expect(loaded).toEqual(SAMPLE_LESSON);
  });

  it("is idempotent: re-running init() does not duplicate or alter the seeded lesson", async () => {
    const factory = new IDBFactory();
    const dbName = freshDbName();
    const { storage: storage1 } = createStorageLayer(factory, dbName);
    await storage1.init();

    const { storage: storage2 } = createStorageLayer(factory, dbName);
    await storage2.init();

    const lessons = await storage2.listLessons();
    const sampleCopies = lessons.filter((l) => l.id === SAMPLE_LESSON.id);
    expect(sampleCopies).toHaveLength(1);
    expect(sampleCopies[0]).toEqual(SAMPLE_LESSON);
  });

  it("does not overwrite an existing qualifying non-sample lesson with the sample", async () => {
    const factory = new IDBFactory();
    const dbName = freshDbName();
    const customLesson = { ...SAMPLE_LESSON, id: "custom-lesson" };
    expect(validateLesson(customLesson).valid).toBe(true);

    const { storage: seedingStorage } = createStorageLayer(factory, dbName);
    await seedingStorage.init(); // this itself seeds SAMPLE_LESSON once
    await seedingStorage.putLesson(customLesson);

    // Re-init should not need to seed again since a qualifying non-sample
    // lesson already exists, but SAMPLE_LESSON (already present) should
    // remain untouched either way.
    const { storage: storage2 } = createStorageLayer(factory, dbName);
    await storage2.init();

    const lessons = await storage2.listLessons();
    expect(lessons.find((l) => l.id === customLesson.id)).toEqual(customLesson);
    expect(lessons.find((l) => l.id === SAMPLE_LESSON.id)).toEqual(SAMPLE_LESSON);
  });
});

describe("Sample lesson availability with zero network calls (Requirements 2.1, 2.2)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(() => {
      throw new Error("fetch should never be called for the bundled Sample_Lesson");
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("makes the Sample_Lesson available on a fresh init() with no prior storage state, without any fetch call", async () => {
    const { storage } = createStorageLayer(new IDBFactory(), freshDbName());
    await storage.init();

    const loaded = await storage.getLesson(SAMPLE_LESSON.id);
    expect(loaded).toEqual(SAMPLE_LESSON);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("SAMPLE_LESSON is available purely as a module-level constant, with no fetch required to reference it", () => {
    // Importing/reading SAMPLE_LESSON is a plain synchronous module access --
    // no network request is possible at this point since no I/O occurs.
    expect(SAMPLE_LESSON.id).toBe("sample-lesson");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
