import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { gradeAttempt, submitAnswer } from "./grading";
import type { Attempt, AnswerOption, Question } from "./types";

// Arbitraries -----------------------------------------------------------

const answerOptionArb: fc.Arbitrary<AnswerOption> = fc.record({
  id: fc.uuid(),
  text: fc.string({ minLength: 1, maxLength: 20 }),
});

/** A Question with exactly 4 distinct options and a correctOptionId among them. */
const questionArb: fc.Arbitrary<Question> = fc
  .tuple(
    fc.uuid(),
    fc.uuid(),
    fc.uuid(),
    fc.string({ minLength: 1, maxLength: 40 }),
    fc.uniqueArray(answerOptionArb, { minLength: 4, maxLength: 4, selector: (o) => o.id }),
    fc.string({ minLength: 1, maxLength: 40 }),
    fc.string({ minLength: 1, maxLength: 40 }),
    fc.integer({ min: 0, max: 3 }),
  )
  .map(([id, sectionId, conceptId, prompt, options, explanation, sourceQuote, correctIdx]) => ({
    id,
    sectionId,
    conceptId,
    prompt,
    options,
    correctOptionId: options[correctIdx].id,
    explanation,
    sourceQuote,
  }));

describe("Property 8: Grading is synchronous and reports correctness against the true correct option", () => {
  // Validates: Requirements 4.1, 4.2
  it("returns synchronously with isCorrect matching (submittedOptionId === correctOptionId) and always reports correctOptionId", () => {
    fc.assert(
      fc.property(
        questionArb.chain((question) =>
          fc.tuple(fc.constant(question), fc.constantFrom(...question.options.map((o) => o.id))),
        ),
        ([question, submittedOptionId]) => {
          const returnValue = gradeAttempt(question, submittedOptionId);

          // "Synchronous" -- gradeAttempt's return value is not a Promise/thenable.
          expect(returnValue).not.toBeInstanceOf(Promise);
          expect(typeof (returnValue as unknown as { then?: unknown }).then).not.toBe("function");

          expect(returnValue.isCorrect).toBe(submittedOptionId === question.correctOptionId);
          expect(returnValue.correctOptionId).toBe(question.correctOptionId);
          expect(returnValue.explanation).toBe(question.explanation);
          expect(returnValue.sourceQuote).toBe(question.sourceQuote);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("reports correctOptionId even when the submitted option is wrong", () => {
    fc.assert(
      fc.property(questionArb, (question) => {
        const wrongOption = question.options.find((o) => o.id !== question.correctOptionId);
        if (!wrongOption) return; // all 4 options happened to be "correct" (impossible by construction, but guard anyway)

        const result = gradeAttempt(question, wrongOption.id);
        expect(result.isCorrect).toBe(false);
        expect(result.correctOptionId).toBe(question.correctOptionId);
      }),
      { numRuns: 200 },
    );
  });
});

describe("Property 9: An answered Question rejects further submissions", () => {
  // Validates: Requirements 4.3
  it("returns the previously computed grade result unchanged and records no new Attempt", () => {
    fc.assert(
      fc.property(
        questionArb.chain((question) =>
          fc.tuple(
            fc.constant(question),
            fc.constantFrom(...question.options.map((o) => o.id)), // prior selection
            fc.constantFrom(...question.options.map((o) => o.id)), // new submission attempt
            fc.integer({ min: 0, max: 1_000_000 }),
          ),
        ),
        ([question, priorOptionId, newOptionId, submittedAt]) => {
          const priorAttempt: Attempt = {
            id: `2025-01-15:${question.id}:${submittedAt}`,
            dateKey: "2025-01-15",
            questionId: question.id,
            selectedOptionId: priorOptionId,
            isCorrect: priorOptionId === question.correctOptionId,
            submittedAt,
          };

          const outcome = submitAnswer(question, newOptionId, priorAttempt, "2025-01-15");

          expect(outcome.ok).toBe(false);
          if (outcome.ok) return; // unreachable, narrows type for TS
          expect(outcome.error.kind).toBe("already-answered");
          if (outcome.error.kind !== "already-answered") return;

          // The returned result reflects the *prior* attempt's correctness, not the new submission.
          expect(outcome.error.prior.isCorrect).toBe(priorOptionId === question.correctOptionId);
          expect(outcome.error.prior.correctOptionId).toBe(question.correctOptionId);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("does not mutate the prior Attempt object", () => {
    fc.assert(
      fc.property(
        questionArb.chain((question) =>
          fc.tuple(fc.constant(question), fc.constantFrom(...question.options.map((o) => o.id))),
        ),
        ([question, priorOptionId]) => {
          const priorAttempt: Attempt = {
            id: `2025-01-15:${question.id}:1000`,
            dateKey: "2025-01-15",
            questionId: question.id,
            selectedOptionId: priorOptionId,
            isCorrect: priorOptionId === question.correctOptionId,
            submittedAt: 1000,
          };
          const snapshot = { ...priorAttempt };

          submitAnswer(question, question.options[0].id, priorAttempt, "2025-01-15");

          expect(priorAttempt).toEqual(snapshot);
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("submitAnswer: invalid/missing option submissions (Requirement 4.4)", () => {
  it("rejects an undefined option id without grading or recording anything", () => {
    fc.assert(
      fc.property(questionArb, (question) => {
        const outcome = submitAnswer(question, undefined, undefined, "2025-01-15");
        expect(outcome).toEqual({ ok: false, error: { kind: "invalid-option" } });
      }),
      { numRuns: 100 },
    );
  });

  it("rejects a blank/whitespace-only option id", () => {
    fc.assert(
      fc.property(questionArb, fc.constantFrom("", "   ", "\t"), (question, blank) => {
        const outcome = submitAnswer(question, blank, undefined, "2025-01-15");
        expect(outcome).toEqual({ ok: false, error: { kind: "invalid-option" } });
      }),
      { numRuns: 100 },
    );
  });

  it("rejects an option id that doesn't belong to the question", () => {
    fc.assert(
      fc.property(questionArb, fc.uuid(), (question, unrelatedId) => {
        fc.pre(!question.options.some((o) => o.id === unrelatedId));
        const outcome = submitAnswer(question, unrelatedId, undefined, "2025-01-15");
        expect(outcome).toEqual({ ok: false, error: { kind: "invalid-option" } });
      }),
      { numRuns: 100 },
    );
  });

  it("succeeds and builds an Attempt for a valid, first-time submission", () => {
    fc.assert(
      fc.property(
        questionArb.chain((question) =>
          fc.tuple(fc.constant(question), fc.constantFrom(...question.options.map((o) => o.id))),
        ),
        ([question, optionId]) => {
          const outcome = submitAnswer(question, optionId, undefined, "2025-01-15", () => 12345);
          expect(outcome.ok).toBe(true);
          if (!outcome.ok) return;
          expect(outcome.attempt).toEqual({
            id: `2025-01-15:${question.id}:12345`,
            dateKey: "2025-01-15",
            questionId: question.id,
            selectedOptionId: optionId,
            isCorrect: optionId === question.correctOptionId,
            submittedAt: 12345,
          });
        },
      ),
      { numRuns: 100 },
    );
  });
});
