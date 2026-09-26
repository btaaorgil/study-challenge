// Scoring_Engine.
// See design.md: "Scoring_Engine (src/domain/scoring.ts)".
// Requirements: 6.1 (pure, order-independent determinism), 6.2 (no side effects,
// no mutation), 6.3 (only current-day/in-scope attempts), 7.1-7.3 (first-attempt-only,
// wrong answers never increase score), 8.1 (clamped 0-100).
// See also steering: scoring.md (pure functions, bounded 0-100%, wrong answers never
// increase score).

import type { Attempt, DailyChallenge } from "./types";

/**
 * Pure function: computes the Score for a Daily_Challenge from a set of
 * Attempts. Does not mutate `attempts`, performs no I/O, and returns the
 * same result regardless of the order Attempts are provided in.
 *
 * Algorithm (per design.md):
 * 1. Filter attempts to those in-scope: matching the challenge's dateKey and
 *    referencing one of its questions (Req 6.3).
 * 2. Group in-scope attempts by questionId; within each group, take the one
 *    with the earliest submittedAt (ties broken by original array position,
 *    for determinism) -- the "first recorded Attempt" (Req 7.1, 7.2).
 * 3. Count how many of those first-attempts are correct (Req 7.3: a wrong
 *    first attempt never increases the score).
 * 4. score = round(correctCount / totalQuestions * 100), clamped to [0, 100]
 *    (Req 6.1, 8.1).
 */
export function calculateScore(
  challenge: DailyChallenge,
  attempts: readonly Attempt[],
): number {
  const questionIds = new Set(challenge.questions.map((q) => q.id));

  const inScope = attempts
    .map((attempt, index) => ({ attempt, index }))
    .filter(
      ({ attempt }) =>
        attempt.dateKey === challenge.dateKey && questionIds.has(attempt.questionId),
    );

  const firstAttemptByQuestion = new Map<string, { attempt: Attempt; index: number }>();
  for (const entry of inScope) {
    const existing = firstAttemptByQuestion.get(entry.attempt.questionId);
    if (
      !existing ||
      entry.attempt.submittedAt < existing.attempt.submittedAt ||
      (entry.attempt.submittedAt === existing.attempt.submittedAt && entry.index < existing.index)
    ) {
      firstAttemptByQuestion.set(entry.attempt.questionId, entry);
    }
  }

  const correctOptionByQuestion = new Map(
    challenge.questions.map((q) => [q.id, q.correctOptionId]),
  );

  let correctCount = 0;
  for (const { attempt } of firstAttemptByQuestion.values()) {
    const correctOptionId = correctOptionByQuestion.get(attempt.questionId);
    if (correctOptionId !== undefined && attempt.selectedOptionId === correctOptionId) {
      correctCount += 1;
    }
  }

  const totalQuestions = challenge.questions.length;
  const rawScore = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  return clamp(rawScore, 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
