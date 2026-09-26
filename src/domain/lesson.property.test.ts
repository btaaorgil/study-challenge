import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { MAX_SECTION_COUNT, MIN_SECTION_COUNT, selectActiveLesson, validateLesson } from "./lesson";
import type { Concept, Lesson, LessonSection } from "./types";

// Arbitraries -----------------------------------------------------------

const conceptArb: fc.Arbitrary<Concept> = fc.record({
  id: fc.uuid(),
  text: fc.string({ minLength: 1, maxLength: 50 }),
  explanation: fc.string({ minLength: 1, maxLength: 50 }),
  sourceQuote: fc.string({ minLength: 1, maxLength: 50 }),
});

/** A section guaranteed to satisfy validateLesson's field bounds. */
const validSectionArb: fc.Arbitrary<LessonSection> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length >= 1),
  explanation: fc
    .string({ minLength: 1, maxLength: 2000 })
    .filter((s) => s.trim().length >= 1),
  concepts: fc.array(conceptArb, { minLength: 1, maxLength: 20 }),
});

/** A lesson with 1-6 valid sections (structurally valid lesson; one section per topic). */
const validLessonArb: fc.Arbitrary<Lesson> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  sections: fc.array(validSectionArb, { minLength: 1, maxLength: 6 }),
});

/** A lesson with an arbitrary (possibly out-of-range) number of sections. */
const anySectionCountLessonArb: fc.Arbitrary<Lesson> = fc.record({
  id: fc.uuid(),
  title: fc.string({ minLength: 1, maxLength: 50 }),
  sections: fc.array(validSectionArb, { minLength: 0, maxLength: 15 }),
});

/**
 * A section whose title/explanation/concept-count may be in-bounds, empty,
 * whitespace-only, boundary-length, or over-length -- used to probe Property 2.
 */
const boundaryStringArb = (maxLen: number): fc.Arbitrary<string> =>
  fc.oneof(
    fc.constant(""), // empty
    fc.constant("   "), // whitespace-only
    fc.constant("a".repeat(maxLen)), // exact max boundary
    fc.constant("a".repeat(maxLen + 1)), // over limit
    fc.string({ minLength: 0, maxLength: maxLen + 10 }), // arbitrary
  );

// Local mirrors of lesson.ts's private bounds, kept in sync intentionally --
// these are the same bounds validateLesson enforces (see design.md Property 2).
const TITLE_MAX_LENGTH_FOR_TEST = 100;
const EXPLANATION_MAX_LENGTH_FOR_TEST = 2000;
const TITLE_MIN_LENGTH_FOR_TEST = 1;
const EXPLANATION_MIN_LENGTH_FOR_TEST = 1;
const CONCEPTS_MIN_COUNT_FOR_TEST = 1;
const CONCEPTS_MAX_COUNT_FOR_TEST = 20;

const anyFieldsSectionArb: fc.Arbitrary<LessonSection> = fc.record({
  id: fc.uuid(),
  title: boundaryStringArb(TITLE_MAX_LENGTH_FOR_TEST),
  explanation: boundaryStringArb(EXPLANATION_MAX_LENGTH_FOR_TEST),
  concepts: fc.array(conceptArb, { minLength: 0, maxLength: 25 }),
});

function isSectionFieldValid(section: LessonSection): boolean {
  const trimmedTitle = section.title.trim();
  const trimmedExplanation = section.explanation.trim();
  return (
    trimmedTitle.length >= TITLE_MIN_LENGTH_FOR_TEST &&
    trimmedTitle.length <= TITLE_MAX_LENGTH_FOR_TEST &&
    trimmedExplanation.length >= EXPLANATION_MIN_LENGTH_FOR_TEST &&
    trimmedExplanation.length <= EXPLANATION_MAX_LENGTH_FOR_TEST &&
    section.concepts.length >= CONCEPTS_MIN_COUNT_FOR_TEST &&
    section.concepts.length <= CONCEPTS_MAX_COUNT_FOR_TEST
  );
}

function lessonWithSingleSection(section: LessonSection): Lesson {
  // Pad with 3 known-valid sections so section-count is always 4; this isolates
  // the field-validity check (Property 2) from the section-count check (Property 1).
  const filler: LessonSection = {
    id: "filler",
    title: "Filler title",
    explanation: "Filler explanation.",
    concepts: [
      { id: "c1", text: "fact", explanation: "why", sourceQuote: "fact" },
    ],
  };
  return {
    id: "lesson-under-test",
    title: "Lesson under test",
    sections: [section, filler, filler, filler],
  };
}

describe("Property 1: Lesson section-count validity", () => {
  // Validates: Requirements 1.1, 1.4
  it("reports valid (w.r.t. section count) iff the lesson has 1-12 sections", () => {
    fc.assert(
      fc.property(anySectionCountLessonArb, (lesson) => {
        const result = validateLesson(lesson);
        const hasSectionCountError = result.errors.some((e) =>
          e.startsWith(`expected ${MIN_SECTION_COUNT}-${MAX_SECTION_COUNT} sections`),
        );
        const inRange =
          lesson.sections.length >= MIN_SECTION_COUNT &&
          lesson.sections.length <= MAX_SECTION_COUNT;

        expect(hasSectionCountError).toBe(!inRange);
        if (!inRange) {
          expect(result.valid).toBe(false);
        } else {
          // Every section here is field-valid, so the count decides validity.
          expect(result.valid).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});

describe("Property 2: Lesson section field validity", () => {
  // Validates: Requirements 1.2, 1.5
  it("reports valid (w.r.t. that section) iff title/explanation/concepts are in bounds", () => {
    fc.assert(
      fc.property(anyFieldsSectionArb, (section) => {
        const lesson = lessonWithSingleSection(section);
        const result = validateLesson(lesson);

        // Only section[0] is under test; the filler sections are always valid,
        // so any section-level error must be about section[0] specifically.
        const hasSection0Error = result.errors.some((e) =>
          e.startsWith("section[0]:"),
        );

        expect(hasSection0Error).toBe(!isSectionFieldValid(section));
      }),
      { numRuns: 200 },
    );
  });

  it("reports a fully valid lesson (4 valid sections) as valid with no errors", () => {
    fc.assert(
      fc.property(validLessonArb, (lesson) => {
        const result = validateLesson(lesson);
        expect(result.valid).toBe(true);
        expect(result.errors).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });
});

describe("Property 4: Active lesson selection falls back to the Sample_Lesson", () => {
  // Validates: Requirements 2.3
  const sampleLesson: Lesson = {
    id: "sample-lesson",
    title: "Sample Lesson",
    sections: [
      {
        id: "s1",
        title: "Section 1",
        explanation: "Explanation 1",
        concepts: [{ id: "c1", text: "t", explanation: "e", sourceQuote: "t" }],
      },
      {
        id: "s2",
        title: "Section 2",
        explanation: "Explanation 2",
        concepts: [{ id: "c2", text: "t", explanation: "e", sourceQuote: "t" }],
      },
      {
        id: "s3",
        title: "Section 3",
        explanation: "Explanation 3",
        concepts: [{ id: "c3", text: "t", explanation: "e", sourceQuote: "t" }],
      },
      {
        id: "s4",
        title: "Section 4",
        explanation: "Explanation 4",
        concepts: [{ id: "c4", text: "t", explanation: "e", sourceQuote: "t" }],
      },
    ],
  };

  /** A stored lesson tagged with whether it should validly qualify as active. */
  const storedLessonArb: fc.Arbitrary<Lesson> = fc.oneof(
    validLessonArb, // valid non-sample lessons
    anySectionCountLessonArb, // possibly-invalid non-sample lessons
  );

  it("returns the Sample_Lesson iff no non-sample stored lesson validates", () => {
    fc.assert(
      fc.property(
        fc.array(storedLessonArb, { minLength: 0, maxLength: 6 }),
        (storedLessons) => {
          // Ensure none of the generated lessons accidentally collide with the
          // sample lesson's id, so "excluding the sample" is well-defined.
          const lessons = storedLessons.map((lesson, i) => ({
            ...lesson,
            id: `stored-${i}-${lesson.id}`,
          }));

          const anyQualifies = lessons.some((l) => validateLesson(l).valid);
          const result = selectActiveLesson(lessons, sampleLesson);

          if (!anyQualifies) {
            expect(result).toBe(sampleLesson);
          } else {
            expect(validateLesson(result).valid).toBe(true);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("returns the Sample_Lesson for an empty stored-lessons list", () => {
    expect(selectActiveLesson([], sampleLesson)).toBe(sampleLesson);
  });

  it("returns the Sample_Lesson when all stored lessons are invalid", () => {
    const invalidLesson: Lesson = { id: "bad", title: "Bad", sections: [] };
    expect(selectActiveLesson([invalidLesson], sampleLesson)).toBe(sampleLesson);
  });

  it("returns a qualifying non-sample lesson when one exists", () => {
    const goodLesson: Lesson = { ...sampleLesson, id: "good-lesson" };
    expect(selectActiveLesson([goodLesson], sampleLesson)).toBe(goodLesson);
  });
});
