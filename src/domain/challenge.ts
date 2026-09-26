// Daily_Challenge generation.
// See design.md: "Domain: generateDailyChallenge (src/domain/challenge.ts)".
// Requirements: 3.1-3.6 (challenge/question shape, distinctness, reuse, idempotent reopen),
// 5.3/5.4 (source traceability, excluding unusable concepts), 9.5 (same-day restore).

import type { StorageLayer } from "../storage/db";
import type { AnswerOption, Concept, DailyChallenge, Lesson, LessonSection, Question } from "./types";
import { createSeededRng, seededShuffle } from "./prng";

const REQUIRED_QUESTION_COUNT = 5;
const OPTIONS_PER_QUESTION = 4;
const SEED_SEPARATOR = ":";

interface PooledConcept {
  concept: Concept;
  section: LessonSection;
}

function flattenConcepts(lesson: Lesson): PooledConcept[] {
  const pooled: PooledConcept[] = [];
  for (const section of lesson.sections) {
    for (const concept of section.concepts) {
      pooled.push({ concept, section });
    }
  }
  return pooled;
}

/**
 * A concept is usable as a Question's correct-answer source only if it has a
 * non-empty explanation and a sourceQuote that is a non-empty, exact
 * substring of either its own text or its section's explanation
 * (Requirement 5.4). Concepts that fail this check are never selected.
 */
function isUsable({ concept, section }: PooledConcept): boolean {
  const explanation = concept.explanation.trim();
  const sourceQuote = concept.sourceQuote.trim();
  if (explanation.length === 0 || sourceQuote.length === 0) return false;
  return (
    concept.text.includes(concept.sourceQuote) ||
    section.explanation.includes(concept.sourceQuote)
  );
}

function buildPrompt(section: LessonSection): string {
  return `According to "${section.title}", which of the following is correct?`;
}

/**
 * Orders candidate concepts for use as distractors: same-section peers
 * first (excluding the current concept), then the rest of the lesson,
 * de-duplicated by concept id. This is the "other concepts... falling back
 * to lesson-wide distractor pool if the section is small" rule from design.md.
 */
function distractorCandidates(all: PooledConcept[], current: PooledConcept): PooledConcept[] {
  const sameSection = all.filter(
    (p) => p.section.id === current.section.id && p.concept.id !== current.concept.id,
  );
  const rest = all.filter(
    (p) => p.section.id !== current.section.id && p.concept.id !== current.concept.id,
  );

  const seen = new Set<string>();
  const ordered: PooledConcept[] = [];
  for (const candidate of [...sameSection, ...rest]) {
    if (!seen.has(candidate.concept.id)) {
      seen.add(candidate.concept.id);
      ordered.push(candidate);
    }
  }
  return ordered;
}

function buildQuestion(
  pooled: PooledConcept,
  allConcepts: PooledConcept[],
  questionId: string,
  rng: () => number,
): Question {
  const { concept, section } = pooled;

  const correctOption: AnswerOption = { id: `${questionId}:optCorrect`, text: concept.text };

  const shuffledCandidates = seededShuffle(distractorCandidates(allConcepts, pooled), rng);
  const distractorTexts: string[] = [];
  for (const candidate of shuffledCandidates) {
    if (distractorTexts.length >= OPTIONS_PER_QUESTION - 1) break;
    if (candidate.concept.text !== concept.text) {
      distractorTexts.push(candidate.concept.text);
    }
  }
  // Defensive fallback for very small lessons: cycle through whatever
  // candidates exist (allowing text reuse) rather than shipping a
  // malformed question with fewer than 4 options. Every valid Lesson
  // (Requirement 1: exactly 4 sections, each with >=1 concept) has at
  // least 3 other concepts in the lesson, so this branch should not be
  // reached in practice.
  let cycleIndex = 0;
  while (distractorTexts.length < OPTIONS_PER_QUESTION - 1 && shuffledCandidates.length > 0) {
    distractorTexts.push(shuffledCandidates[cycleIndex % shuffledCandidates.length].concept.text);
    cycleIndex++;
  }
  while (distractorTexts.length < OPTIONS_PER_QUESTION - 1) {
    distractorTexts.push(`(no alternative available ${distractorTexts.length})`);
  }

  const distractorOptions: AnswerOption[] = distractorTexts.map((text, i) => ({
    id: `${questionId}:optDistractor${i}`,
    text,
  }));

  const options = seededShuffle([correctOption, ...distractorOptions], rng);

  return {
    id: questionId,
    sectionId: section.id,
    conceptId: concept.id,
    prompt: buildPrompt(section),
    options,
    correctOptionId: correctOption.id,
    explanation: concept.explanation,
    sourceQuote: concept.sourceQuote,
  };
}

/**
 * Pure, deterministic helper: given the same Lesson and seed, always
 * produces the same 5 Questions in the same order (no `Math.random()` is
 * used anywhere in this module).
 *
 * Throws if the Lesson has zero usable concepts (Requirement 5.4 excludes
 * unusable concepts from selection entirely; a Lesson with none at all
 * cannot produce a Daily_Challenge). Lessons authored per Requirement 1/2
 * are expected to always have at least one usable concept.
 */
export function selectQuestions(
  lesson: Lesson,
  seed: string,
  count: number = REQUIRED_QUESTION_COUNT,
): Question[] {
  const allConcepts = flattenConcepts(lesson);
  const usable = allConcepts.filter(isUsable);

  if (usable.length === 0) {
    throw new Error(
      `selectQuestions: lesson "${lesson.id}" has no usable concepts (none have a derivable explanation and sourceQuote)`,
    );
  }

  const rng = createSeededRng(seed);
  const shuffledUsable = seededShuffle(usable, rng);

  const chosen: PooledConcept[] = [];
  for (let i = 0; i < count; i++) {
    // If pool size >= count, this indexes distinct entries 0..count-1.
    // If pool size < count, this round-robins through the shuffled pool
    // (Requirement 3.6).
    chosen.push(shuffledUsable[i % shuffledUsable.length]);
  }

  return chosen.map((pooled, i) =>
    buildQuestion(pooled, allConcepts, `${lesson.id}${SEED_SEPARATOR}${seed}${SEED_SEPARATOR}q${i}`, rng),
  );
}

/**
 * Get-or-create for the current day: returns the existing Daily_Challenge
 * for `dateKey` if one has already been generated (Requirement 3.5),
 * otherwise generates exactly 5 Questions via `selectQuestions`, persists
 * the result, and returns it.
 */
export async function getOrCreateDailyChallenge(
  dateKey: string,
  lesson: Lesson,
  storage: StorageLayer,
): Promise<DailyChallenge> {
  const existing = await storage.getDailyChallenge(dateKey);
  if (existing && existing.lessonId === lesson.id) {
    return existing;
  }

  return generateAndPersistDailyChallenge(dateKey, lesson, storage);
}

/**
 * Unconditionally (re)generates today's Daily_Challenge from `lesson` and
 * persists it, overwriting whatever was previously stored for `dateKey`.
 * Used when a brand-new lesson is imported ("Add Lesson") and should
 * immediately become the source for today's questions, even if a challenge
 * from a *different* (now-replaced) lesson already exists for today.
 */
export async function generateAndPersistDailyChallenge(
  dateKey: string,
  lesson: Lesson,
  storage: StorageLayer,
): Promise<DailyChallenge> {
  const seed = `${dateKey}${SEED_SEPARATOR}${lesson.id}`;
  const questions = selectQuestions(lesson, seed, REQUIRED_QUESTION_COUNT);
  const challenge: DailyChallenge = { dateKey, lessonId: lesson.id, questions };

  await storage.putDailyChallenge(challenge);
  return challenge;
}

/**
 * Builds a comprehensive "Final Exam" DailyChallenge-shaped set covering
 * every section of the lesson: draws (at least) `perSection` questions from
 * each of the lesson's 4 sections instead of one pooled selection, so all
 * sections are represented rather than left to chance. Not persisted under
 * the normal per-day dateKey -- callers store/display it separately (Exam
 * Mode is a distinct, on-demand mode, not part of the daily-challenge flow).
 */
export function buildExam(lesson: Lesson, seed: string, perSection: number = 2): DailyChallenge {
  const questionsBySection = lesson.sections.map((section) => {
    const singleSectionLesson: Lesson = { ...lesson, sections: [section] };
    return selectQuestions(singleSectionLesson, `${seed}${SEED_SEPARATOR}exam${SEED_SEPARATOR}${section.id}`, perSection);
  });

  const rng = createSeededRng(`${seed}${SEED_SEPARATOR}exam-order`);
  const questions = seededShuffle(questionsBySection.flat(), rng);

  return {
    dateKey: `exam${SEED_SEPARATOR}${seed}`,
    lessonId: lesson.id,
    questions,
  };
}

/**
 * Formats a Date using its local (not UTC) calendar date as "YYYY-MM-DD",
 * per design.md's "Calendar day determination". Intended for use by the
 * Challenge_View when computing `dateKey` on mount / focus (Requirement 9.5).
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
