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

describe("buildExam: Test Yourself exam over the whole lesson", () => {
  it("covers every section and asks each usable concept once", () => {
    const lesson = makeLesson("exam-lesson");
    const exam = buildExam(lesson, "seed-1");

    const sectionIdsCovered = new Set(exam.questions.map((q) => q.sectionId));
    for (const section of lesson.sections) {
      expect(sectionIdsCovered.has(section.id)).toBe(true);
    }
    // 4 sections x 3 concepts = 12 concepts, each asked exactly once.
    expect(exam.questions).toHaveLength(12);
    expect(new Set(exam.questions.map((q) => q.conceptId)).size).toBe(12);
  });

  it("caps long lessons at maxQuestions while still touching every section", () => {
    const lesson = makeLesson("exam-lesson-cap");
    const exam = buildExam(lesson, "seed-cap", "normal", 6);
    expect(exam.questions).toHaveLength(6);
    expect(new Set(exam.questions.map((q) => q.sectionId)).size).toBe(4);
  });

  it("reaches at least 5 questions for tiny lessons by reusing concepts", () => {
    const tiny: Lesson = { ...makeLesson("tiny"), sections: [makeLesson("tiny").sections[0]] };
    tiny.sections[0] = { ...tiny.sections[0], concepts: tiny.sections[0].concepts.slice(0, 2) };
    expect(buildExam(tiny, "seed-tiny").questions).toHaveLength(5);
  });

  it("is deterministic for the same lesson, seed, and difficulty", () => {
    const lesson = makeLesson("exam-lesson-2");
    expect(buildExam(lesson, "seed-a", "hard")).toEqual(buildExam(lesson, "seed-a", "hard"));
  });

  it("produces well-formed questions at every difficulty (3 options on Easy, 4 otherwise)", () => {
    const lesson = makeLesson("exam-lesson-3");
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const exam = buildExam(lesson, "seed-b", difficulty);
      expect(exam.difficulty).toBe(difficulty);
      for (const question of exam.questions) {
        expect(question.options).toHaveLength(difficulty === "easy" ? 3 : 4);
        expect(question.options.filter((o) => o.id === question.correctOptionId)).toHaveLength(1);
      }
    }
  });
});

describe("getOrCreateDailyChallenge: difficulty", () => {
  it("regenerates at a new difficulty while today's challenge is untouched", async () => {
    const { storage } = freshStorage();
    await storage.init();
    const lesson = makeLesson("diff-a");
    const dateKey = "2025-04-01";

    const normal = await getOrCreateDailyChallenge(dateKey, lesson, storage, "normal");
    const easy = await getOrCreateDailyChallenge(dateKey, lesson, storage, "easy");

    expect(normal.difficulty).toBe("normal");
    expect(easy.difficulty).toBe("easy");
    expect(easy.questions.every((q) => q.options.length === 3)).toBe(true);
  });

  it("locks the difficulty once today's challenge has an answer (first-attempt scoring stays honest)", async () => {
    const { storage } = freshStorage();
    await storage.init();
    const lesson = makeLesson("diff-b");
    const dateKey = "2025-04-02";

    const started = await getOrCreateDailyChallenge(dateKey, lesson, storage, "normal");
    const q = started.questions[0];
    await storage.putAttempt({
      id: `${dateKey}:${q.id}:1`,
      dateKey,
      questionId: q.id,
      selectedOptionId: q.correctOptionId,
      isCorrect: true,
      submittedAt: 1,
    });

    const again = await getOrCreateDailyChallenge(dateKey, lesson, storage, "hard");
    expect(again).toEqual(started);
  });
});
