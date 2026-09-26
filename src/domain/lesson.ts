// Lesson validation and active-lesson selection.
// See design.md: "Domain: validateLesson", "Domain: selectActiveLesson".
// Requirements: 1.1, 1.2, 1.4, 1.5 (validateLesson); 2.3 (selectActiveLesson).

import type { Lesson, LessonSection } from "./types";

// A lesson has one section per topic it teaches, so the count is driven by
// the content itself, bounded to keep the dashboard and exams readable.
export const MIN_SECTION_COUNT = 1;
export const MAX_SECTION_COUNT = 12;
const TITLE_MIN_LENGTH = 1;
const TITLE_MAX_LENGTH = 100;
const EXPLANATION_MIN_LENGTH = 1;
const EXPLANATION_MAX_LENGTH = 2000;
const CONCEPTS_MIN_COUNT = 1;
const CONCEPTS_MAX_COUNT = 20;

export interface LessonValidationResult {
  valid: boolean;
  errors: string[]; // e.g. "expected 1-12 sections, got 0"
}

/**
 * Validates a Lesson's structure per Requirement 1:
 * - between 1 and 12 LessonSections, one per topic (1.1, 1.4)
 * - each section's trimmed title (1-100 chars), trimmed explanation (1-2000 chars),
 *   and concept count (1-20) (1.2, 1.5)
 *
 * Collects every violation (not just the first) so callers can surface a full
 * rejection reason.
 */
export function validateLesson(lesson: Lesson): LessonValidationResult {
  const errors: string[] = [];

  const sectionCount = lesson.sections.length;
  if (sectionCount < MIN_SECTION_COUNT || sectionCount > MAX_SECTION_COUNT) {
    errors.push(
      `expected ${MIN_SECTION_COUNT}-${MAX_SECTION_COUNT} sections, got ${sectionCount}`,
    );
  }

  lesson.sections.forEach((section, index) => {
    errors.push(...validateSection(section, index));
  });

  return { valid: errors.length === 0, errors };
}

function validateSection(section: LessonSection, index: number): string[] {
  const errors: string[] = [];
  const label = `section[${index}]`;

  const trimmedTitle = section.title.trim();
  if (
    trimmedTitle.length < TITLE_MIN_LENGTH ||
    trimmedTitle.length > TITLE_MAX_LENGTH
  ) {
    errors.push(
      `${label}: title must be ${TITLE_MIN_LENGTH}-${TITLE_MAX_LENGTH} chars after trimming, got ${trimmedTitle.length}`,
    );
  }

  const trimmedExplanation = section.explanation.trim();
  if (
    trimmedExplanation.length < EXPLANATION_MIN_LENGTH ||
    trimmedExplanation.length > EXPLANATION_MAX_LENGTH
  ) {
    errors.push(
      `${label}: explanation must be ${EXPLANATION_MIN_LENGTH}-${EXPLANATION_MAX_LENGTH} chars after trimming, got ${trimmedExplanation.length}`,
    );
  }

  const conceptCount = section.concepts.length;
  if (conceptCount < CONCEPTS_MIN_COUNT || conceptCount > CONCEPTS_MAX_COUNT) {
    errors.push(
      `${label}: concepts must be ${CONCEPTS_MIN_COUNT}-${CONCEPTS_MAX_COUNT} items, got ${conceptCount}`,
    );
  }

  return errors;
}

/**
 * Returns the first stored lesson (excluding the sample lesson) that passes
 * validateLesson; falls back to sampleLesson if none qualifies.
 * See design.md: "Domain: selectActiveLesson" (Requirement 2.3).
 */
export function selectActiveLesson(
  storedLessons: Lesson[],
  sampleLesson: Lesson,
): Lesson {
  const qualifying = storedLessons.find(
    (lesson) => lesson.id !== sampleLesson.id && validateLesson(lesson).valid,
  );
  return qualifying ?? sampleLesson;
}

/**
 * Resolves the active lesson honoring an explicit "active lesson id"
 * pointer (set when the user imports a lesson via "Add Lesson") ahead of
 * the generic selectActiveLesson fallback rule. If the pointer references a
 * lesson that no longer exists or no longer validates, falls back to
 * selectActiveLesson's normal behavior rather than failing.
 */
export function resolveActiveLesson(
  storedLessons: Lesson[],
  sampleLesson: Lesson,
  activeLessonId: string | undefined,
): Lesson {
  if (activeLessonId) {
    const pointed = storedLessons.find((lesson) => lesson.id === activeLessonId);
    if (pointed && validateLesson(pointed).valid) {
      return pointed;
    }
  }
  return selectActiveLesson(storedLessons, sampleLesson);
}
