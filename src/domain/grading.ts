// Grading_Engine.
// See design.md: "Grading_Engine (src/domain/grading.ts)".
// Requirements: 4.1, 4.2 (instant, always-show-correct-answer grading);
// 4.3 (reject resubmission on an already-answered question);
// 4.4 (reject invalid/missing option ids); 5.1, 5.2 (explanation/sourceQuote feedback).

import type { Attempt, Question } from "./types";

export interface GradeResult {
  isCorrect: boolean;
  correctOptionId: string;
  explanation: string;
  sourceQuote: string;
}

export type SubmitAnswerError =
  | { kind: "invalid-option" }
  | { kind: "already-answered"; prior: GradeResult };

export type SubmitAnswerResult =
  | { ok: true; result: GradeResult; attempt: Attempt }
  | { ok: false; error: SubmitAnswerError };

/**
 * Pure, synchronous grading of a submitted option against a Question.
 * Always reports the question's correctOptionId (win or lose) along with
 * the correct option's explanation/sourceQuote, regardless of which option
 * was submitted (Requirement 4.2, 5.1, 5.2).
 */
export function gradeAttempt(question: Question, submittedOptionId: string): GradeResult {
  return {
    isCorrect: submittedOptionId === question.correctOptionId,
    correctOptionId: question.correctOptionId,
    explanation: question.explanation,
    sourceQuote: question.sourceQuote,
  };
}

function isValidOptionId(question: Question, optionId: string | undefined): optionId is string {
  if (optionId === undefined) return false;
  if (optionId.trim().length === 0) return false;
  return question.options.some((option) => option.id === optionId);
}

/**
 * Orchestration wrapper around `gradeAttempt` for a single submission:
 * - Rejects undefined/blank/unrecognized option ids without grading or
 *   recording anything (Requirement 4.4).
 * - Rejects a second submission for a question that already has a same-day
 *   Attempt, returning the previously computed result unchanged instead of
 *   grading again (Requirement 4.3).
 * - Otherwise grades the submission, builds an Attempt (with a
 *   `submittedAt` timestamp for chronological ordering), and returns it for
 *   the caller to persist via `storage.putAttempt`.
 *
 * Note: design.md's signature omits `dateKey`, but `Attempt` requires it
 * (both as a field and inside its `id`). It is added here as an explicit
 * parameter -- the caller (Challenge_View) always knows the current day's
 * `dateKey` already, so this keeps `submitAnswer` itself pure/synchronous
 * without reaching for ambient state.
 */
export function submitAnswer(
  question: Question,
  submittedOptionId: string | undefined,
  priorAttempt: Attempt | undefined,
  dateKey: string,
  now: () => number = Date.now,
): SubmitAnswerResult {
  if (priorAttempt) {
    const priorResult = gradeAttemptFromAttempt(question, priorAttempt);
    return { ok: false, error: { kind: "already-answered", prior: priorResult } };
  }

  if (!isValidOptionId(question, submittedOptionId)) {
    return { ok: false, error: { kind: "invalid-option" } };
  }

  const result = gradeAttempt(question, submittedOptionId);
  const submittedAt = now();
  const attempt: Attempt = {
    id: `${dateKey}:${question.id}:${submittedAt}`,
    dateKey,
    questionId: question.id,
    selectedOptionId: submittedOptionId,
    isCorrect: result.isCorrect,
    submittedAt,
  };

  return { ok: true, result, attempt };
}

/** Reconstructs the GradeResult that a previously recorded Attempt would have produced. */
function gradeAttemptFromAttempt(question: Question, attempt: Attempt): GradeResult {
  return gradeAttempt(question, attempt.selectedOptionId);
}
