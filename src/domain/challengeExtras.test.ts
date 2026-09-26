import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createStorageLayer } from "../storage/db";
import { buildExam, generateAndPersistDailyChallenge, getOrCreateDailyChallenge } from "./challenge";
import type { Lesson } from "./types";

function makeLesson(id: string): Lesson {
  return {
    id,
    title: `Lesson ${id}`,
    sections: [0, 1, 2, 3].map((i) => ({
      id: `${id}-s${i}`,
      title: `Section ${i}`,
      explanation: `Explanation for section ${i}.`,
      concepts: [0, 1, 2].map((j) => ({
        id: `${id}-s${i}-c${j}`,
        text: `Fact ${i}-${j} about this topic`,
        explanation: `Why fact ${i}-${j} is true.`,
        sourceQuote: `Fact ${i}-${j}`,
      })),
    })),
  };
}

let dbCounter = 0;
function freshStorage() {
  dbCounter += 1;
  return createStorageLayer(new IDBFactory(), `challenge-extras-${dbCounter}`);
}

describe("generateAndPersistDailyChallenge: unconditional regeneration", () => {
  it("overwrites an existing Daily_Challenge for the same dateKey with one from a new lesson", async () => {
    const { storage } = freshStorage();
    await storage.init();

    const lessonA = makeLesson("lesson-a");
    const lessonB = makeLesson("lesson-b");
    const dateKey = "2025-03-01";

    const original = await getOrCreateDailyChallenge(dateKey, lessonA, storage);
    expect(original.lessonId).toBe(lessonA.id);

    const regenerated = await generateAndPersistDailyChallenge(dateKey, lessonB, storage);
    expect(regenerated.lessonId).toBe(lessonB.id);

    const persisted = await storage.getDailyChallenge(dateKey);
    expect(persisted?.lessonId).toBe(lessonB.id);
  });

  it("getOrCreateDailyChallenge regenerates automatically when the stored challenge is from a different lesson", async () => {
    const { storage } = freshStorage();
    await storage.init();

    const lessonA = makeLesson("lesson-a2");
    const lessonB = makeLesson("lesson-b2");
    const dateKey = "2025-03-02";

    await getOrCreateDailyChallenge(dateKey, lessonA, storage);
    const result = await getOrCreateDailyChallenge(dateKey, lessonB, storage);

    expect(result.lessonId).toBe(lessonB.id);
  });

  it("getOrCreateDailyChallenge still returns the unchanged existing challenge for the same lesson (Requirement 3.5)", async () => {
    const { storage } = freshStorage();
    await storage.init();

    const lesson = makeLesson("lesson-c");
    const dateKey = "2025-03-03";

    const first = await getOrCreateDailyChallenge(dateKey, lesson, storage);
    const second = await getOrCreateDailyChallenge(dateKey, lesson, storage);

    expect(second).toEqual(first);
  });
});

describe("buildExam: comprehensive multi-section exam", () => {
  it("draws questions from every section of the lesson", () => {
    const lesson = makeLesson("exam-lesson");
    const exam = buildExam(lesson, "seed-1", 2);

    const sectionIdsCovered = new Set(exam.questions.map((q) => q.sectionId));
    for (const section of lesson.sections) {
      expect(sectionIdsCovered.has(section.id)).toBe(true);
    }
    expect(exam.questions).toHaveLength(lesson.sections.length * 2);
  });

  it("is deterministic for the same lesson and seed", () => {
    const lesson = makeLesson("exam-lesson-2");
    const first = buildExam(lesson, "seed-a", 2);
    const second = buildExam(lesson, "seed-a", 2);
    expect(second).toEqual(first);
  });

  it("produces well-formed questions (4 options, 1 correct) for every exam question", () => {
    const lesson = makeLesson("exam-lesson-3");
    const exam = buildExam(lesson, "seed-b", 2);
    for (const question of exam.questions) {
      expect(question.options).toHaveLength(4);
      expect(question.options.some((o) => o.id === question.correctOptionId)).toBe(true);
    }
  });
});
