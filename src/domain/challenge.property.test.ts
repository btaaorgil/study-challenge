import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { IDBFactory } from "fake-indexeddb";
import { getOrCreateDailyChallenge, selectQuestions } from "./challenge";
import { createStorageLayer } from "../storage/db";
import type { Concept, Lesson, LessonSection } from "./types";

// Arbitraries -----------------------------------------------------------

/**
 * A "usable" Concept per Requirement 5.4: non-empty explanation, and a
 * sourceQuote that is a non-empty exact substring of its own text.
 */
function usableConceptArb(idPrefix: string): fc.Arbitrary<Concept> {
  return fc
    .string({ minLength: 4, maxLength: 20 })
    .filter((s) => s.trim().length >= 4)
    .chain((text) =>
      fc.record({
        id: fc.constant(`${idPrefix}`),
        text: fc.constant(text),
        explanation: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
        // A guaranteed non-empty substring of `text`.
        sourceQuote: fc.constant(text.slice(0, Math.max(1, Math.floor(text.length / 2)))),
      }),
    );
}

function sectionArb(idPrefix: string, conceptCount: number): fc.Arbitrary<LessonSection> {
  return fc.record({
    id: fc.constant(idPrefix),
    title: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
    explanation: fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0),
    concepts: fc.tuple(
      ...Array.from({ length: conceptCount }, (_, i) => usableConceptArb(`${idPrefix}-c${i}`)),
    ),
  });
}

/** A structurally valid Lesson (exactly 4 sections) with `perSectionConceptCount` usable concepts each. */
function validLessonArb(perSectionConceptCount: number): fc.Arbitrary<Lesson> {
  return fc
    .tuple(
      fc.uuid(),
      sectionArb("s0", perSectionConceptCount),
      sectionArb("s1", perSectionConceptCount),
      sectionArb("s2", perSectionConceptCount),
      sectionArb("s3", perSectionConceptCount),
    )
    .map(([id, s0, s1, s2, s3]) => ({ id, title: "Lesson", sections: [s0, s1, s2, s3] }));
}

const dateKeyArb = fc
  .tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

describe("Property 5: Generated Daily_Challenge has the required shape", () => {
  // Validates: Requirements 3.1, 3.3, 3.4
  it("produces exactly 5 questions, each with exactly 4 options and exactly 1 correct option", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }).chain((n) => validLessonArb(n)),
        dateKeyArb,
        (lesson, dateKey) => {
          const seed = `${dateKey}:${lesson.id}`;
          const questions = selectQuestions(lesson, seed, 5);

          expect(questions).toHaveLength(5);
          for (const question of questions) {
            expect(question.options).toHaveLength(4);
            const correctCount = question.options.filter(
              (o) => o.id === question.correctOptionId,
            ).length;
            expect(correctCount).toBe(1);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Property 6: Concept usage respects distinctness and reuse rules", () => {
  // Validates: Requirements 3.2, 3.6
  it("uses distinct concepts when the lesson has >= 5 usable concepts", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }).chain((n) => validLessonArb(n)), // 4 sections * 2..4 = 8..16 concepts
        dateKeyArb,
        (lesson, dateKey) => {
          const seed = `${dateKey}:${lesson.id}`;
          const questions = selectQuestions(lesson, seed, 5);
          const conceptIds = questions.map((q) => q.conceptId);
          expect(new Set(conceptIds).size).toBe(5);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("reuses concepts to still produce exactly 5 questions when the lesson has 1-4 usable concepts", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1 }).chain((n) => validLessonArb(n)), // 4 sections * 1 = 4 concepts total
        dateKeyArb,
        (lesson, dateKey) => {
          const seed = `${dateKey}:${lesson.id}`;
          const questions = selectQuestions(lesson, seed, 5);

          expect(questions).toHaveLength(5);
          const conceptIds = questions.map((q) => q.conceptId);
          const distinctIds = new Set(conceptIds);
          // With only 4 usable concepts and 5 questions required, at least one
          // concept must be reused.
          expect(distinctIds.size).toBeLessThan(5);
          expect(distinctIds.size).toBeGreaterThan(0);
          // Every concept used must actually belong to the lesson's usable pool.
          const allConceptIds = new Set(
            lesson.sections.flatMap((s) => s.concepts.map((c) => c.id)),
          );
          for (const id of conceptIds) {
            expect(allConceptIds.has(id)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Property 7: Reopening the Challenge_View is idempotent", () => {
  // Validates: Requirements 3.5
  it("returns a deep-equal Daily_Challenge on a second get-or-create call for the same day", async () => {
    let dbCounter = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 6 }).chain((n) => validLessonArb(n)),
        dateKeyArb,
        async (lesson, dateKey) => {
          dbCounter += 1;
          const { storage } = createStorageLayer(new IDBFactory(), `idempotent-test-${dbCounter}`);
          await storage.init();

          const first = await getOrCreateDailyChallenge(dateKey, lesson, storage);
          const second = await getOrCreateDailyChallenge(dateKey, lesson, storage);

          expect(second).toEqual(first);
        },
      ),
      { numRuns: 30 },
    );
  });

  it("selectQuestions alone (no storage) is deterministic for the same lesson and seed", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 6 }).chain((n) => validLessonArb(n)),
        dateKeyArb,
        (lesson, dateKey) => {
          const seed = `${dateKey}:${lesson.id}`;
          const first = selectQuestions(lesson, seed, 5);
          const second = selectQuestions(lesson, seed, 5);
          expect(second).toEqual(first);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("Property 10: Every generated Question is traceable to its source", () => {
  // Validates: Requirements 5.1, 5.2, 5.3, 5.4
  it("has a non-empty explanation/sourceQuote, a sourceQuote that is a substring of the source concept's text, and a correct sectionId", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }).chain((n) => validLessonArb(n)),
        dateKeyArb,
        (lesson, dateKey) => {
          const seed = `${dateKey}:${lesson.id}`;
          const questions = selectQuestions(lesson, seed, 5);

          const sectionById = new Map(lesson.sections.map((s) => [s.id, s]));
          const conceptById = new Map(
            lesson.sections.flatMap((s) => s.concepts.map((c) => [c.id, c] as const)),
          );

          for (const question of questions) {
            expect(question.explanation.length).toBeGreaterThan(0);
            expect(question.sourceQuote.length).toBeGreaterThan(0);

            const section = sectionById.get(question.sectionId);
            expect(section).toBeDefined();

            const concept = conceptById.get(question.conceptId);
            expect(concept).toBeDefined();
            // The concept must actually belong to the section this question claims.
            expect(section!.concepts.some((c) => c.id === concept!.id)).toBe(true);

            const isSubstringOfConceptText = concept!.text.includes(question.sourceQuote);
            const isSubstringOfSectionExplanation = section!.explanation.includes(
              question.sourceQuote,
            );
            expect(isSubstringOfConceptText || isSubstringOfSectionExplanation).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("never selects a concept with an empty explanation or an unusable sourceQuote", () => {
    // Build a lesson where section 0 has one usable concept and one deliberately
    // unusable concept (empty explanation); every other section is fully usable.
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 3 }).chain((n) => validLessonArb(n)),
        dateKeyArb,
        (baseLesson, dateKey) => {
          const unusableConcept: Concept = {
            id: "unusable-concept",
            text: "some fact",
            explanation: "", // empty explanation -> unusable
            sourceQuote: "some fact",
          };
          const lesson: Lesson = {
            ...baseLesson,
            sections: [
              { ...baseLesson.sections[0], concepts: [...baseLesson.sections[0].concepts, unusableConcept] },
              ...baseLesson.sections.slice(1),
            ],
          };

          const seed = `${dateKey}:${lesson.id}`;
          const questions = selectQuestions(lesson, seed, 5);

          expect(questions.every((q) => q.conceptId !== unusableConcept.id)).toBe(true);
        },
      ),
      { numRuns: 50 },
    );
  });
});
