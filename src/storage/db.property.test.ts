import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { IDBFactory } from "fake-indexeddb";
import { createStorageLayer } from "./db";
import type { Attempt, Concept, DailyChallenge, Lesson, LessonSection } from "../domain/types";

let dbCounter = 0;
/** A fresh, isolated IndexedDB factory + unique db name per test run, so tests never collide. */
function freshFactory(): IDBFactory {
  return new IDBFactory();
}
function freshDbName(): string {
  dbCounter += 1;
  return `test-db-${dbCounter}`;
}

// Arbitraries -----------------------------------------------------------

const conceptArb: fc.Arbitrary<Concept> = fc.record({
  id: fc.uuid(),
  text: fc.string({ minLength: 1, maxLength: 30 }),
  explanation: fc.string({ minLength: 1, maxLength: 30 }),
  sourceQuote: fc.string({ minLength: 1, maxLength: 30 }),
});

const sectionArb: fc.Arbitrary<LessonSection> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 30 }),
  explanation: fc.string({ minLength: 1, maxLength: 30 }),
  concepts: fc.array(conceptArb, { minLength: 1, maxLength: 5 }),
});

/** A lesson with exactly 4 distinctly-ordered sections (title encodes original position). */
const orderedLessonArb: fc.Arbitrary<Lesson> = fc
  .tuple(fc.uuid(), sectionArb, sectionArb, sectionArb, sectionArb)
  .map(([id, s0, s1, s2, s3]) => {
    const sections = [s0, s1, s2, s3].map((s, i) => ({ ...s, title: `${i}:${s.title}` }));
    return { id, title: "Ordered Lesson", sections };
  });

const answerOptionArb = fc.record({
  id: fc.uuid(),
  text: fc.string({ minLength: 1, maxLength: 20 }),
});

const questionArb = fc
  .tuple(
    fc.uuid(),
    fc.uuid(),
    fc.uuid(),
    fc.string({ minLength: 1, maxLength: 40 }),
    fc.array(answerOptionArb, { minLength: 4, maxLength: 4 }),
    fc.string({ minLength: 1, maxLength: 40 }),
    fc.string({ minLength: 1, maxLength: 40 }),
  )
  .map(([id, sectionId, conceptId, prompt, options, explanation, sourceQuote]) => ({
    id,
    sectionId,
    conceptId,
    prompt,
    options,
    correctOptionId: options[0].id,
    explanation,
    sourceQuote,
  }));

const dateKeyArb = fc
  .tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(
    ([y, m, d]) =>
      `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
  );

const dailyChallengeArb: fc.Arbitrary<DailyChallenge> = fc
  .tuple(dateKeyArb, fc.uuid(), fc.array(questionArb, { minLength: 5, maxLength: 5 }))
  .map(([dateKey, lessonId, questions]) => ({ dateKey, lessonId, questions }));

function attemptsForChallenge(challenge: DailyChallenge): fc.Arbitrary<Attempt[]> {
  return fc.tuple(
    ...challenge.questions.map((q) =>
      fc.record({
        id: fc.constant(`${challenge.dateKey}:${q.id}:${Date.now()}`),
        dateKey: fc.constant(challenge.dateKey),
        questionId: fc.constant(q.id),
        selectedOptionId: fc.constantFrom(...q.options.map((o) => o.id)),
        isCorrect: fc.boolean(),
        submittedAt: fc.integer({ min: 0, max: 10_000_000 }),
      }),
    ),
  );
}

describe("Property 3: Section order is preserved on load", () => {
  // Validates: Requirements 1.3
  it("preserves the authored section order through a storage round-trip", async () => {
    await fc.assert(
      fc.asyncProperty(orderedLessonArb, async (lesson) => {
        const { storage } = createStorageLayer(freshFactory(), freshDbName());
        await storage.init();
        await storage.putLesson(lesson);
        const loaded = await storage.getLesson(lesson.id);

        expect(loaded).toBeDefined();
        expect(loaded!.sections.map((s) => s.title)).toEqual(
          lesson.sections.map((s) => s.title),
        );
      }),
      { numRuns: 50 },
    );
  });
});

describe("Property 15: Storage round-trips a Daily_Challenge and its Attempts", () => {
  // Validates: Requirements 9.5
  it("reads back a deep-equal Daily_Challenge and Attempts for the same dateKey", async () => {
    await fc.assert(
      fc.asyncProperty(
        dailyChallengeArb.chain((challenge) =>
          attemptsForChallenge(challenge).map((attempts) => ({ challenge, attempts })),
        ),
        async ({ challenge, attempts }) => {
          const { storage } = createStorageLayer(freshFactory(), freshDbName());
          await storage.init();

          await storage.putDailyChallenge(challenge);
          for (const attempt of attempts) {
            await storage.putAttempt(attempt);
          }

          const loadedChallenge = await storage.getDailyChallenge(challenge.dateKey);
          const loadedAttempts = await storage.getAttempts(challenge.dateKey);

          expect(loadedChallenge).toEqual(challenge);
          expect(
            [...loadedAttempts].sort((a, b) => a.id.localeCompare(b.id)),
          ).toEqual([...attempts].sort((a, b) => a.id.localeCompare(b.id)));
        },
      ),
      { numRuns: 50 },
    );
  });
});
