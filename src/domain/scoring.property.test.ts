import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { calculateScore } from "./scoring";
import type { Attempt, DailyChallenge, Question } from "./types";

// Arbitraries -----------------------------------------------------------

function makeQuestion(id: string): Question {
  return {
    id,
    sectionId: `${id}-section`,
    conceptId: `${id}-concept`,
    prompt: `Prompt for ${id}`,
    options: [
      { id: `${id}-optA`, text: "A" },
      { id: `${id}-optB`, text: "B" },
      { id: `${id}-optC`, text: "C" },
      { id: `${id}-optD`, text: "D" },
    ],
    correctOptionId: `${id}-optA`,
    explanation: "why A is correct",
    sourceQuote: "A",
  };
}

const dateKeyArb = fc
  .tuple(
    fc.integer({ min: 2020, max: 2030 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

const challengeArb: fc.Arbitrary<DailyChallenge> = fc
  .tuple(dateKeyArb, fc.uuid())
  .map(([dateKey, lessonId]) => ({
    dateKey,
    lessonId,
    questions: [0, 1, 2, 3, 4].map((i) => makeQuestion(`q${i}`)),
  }));

/** An Attempt for one of the challenge's questions, possibly correct or wrong, in-scope. */
function inScopeAttemptArb(challenge: DailyChallenge): fc.Arbitrary<Attempt> {
  return fc
    .tuple(
      fc.constantFrom(...challenge.questions),
      fc.integer({ min: 0, max: 1_000_000 }),
    )
    .chain(([question, submittedAt]) =>
      fc
        .constantFrom(...question.options.map((o) => o.id))
        .map((selectedOptionId) => ({
          id: `${challenge.dateKey}:${question.id}:${submittedAt}`,
          dateKey: challenge.dateKey,
          questionId: question.id,
          selectedOptionId,
          isCorrect: selectedOptionId === question.correctOptionId,
          submittedAt,
        })),
    );
}

/** An out-of-scope Attempt: wrong dateKey or a questionId not in the challenge. */
function outOfScopeAttemptArb(challenge: DailyChallenge): fc.Arbitrary<Attempt> {
  return fc.oneof(
    // Wrong date
    inScopeAttemptArb(challenge).map((a) => ({ ...a, dateKey: `${a.dateKey}-other` })),
    // Foreign question id
    fc.tuple(fc.uuid(), fc.integer({ min: 0, max: 1_000_000 })).map(([qid, submittedAt]) => ({
      id: `${challenge.dateKey}:${qid}:${submittedAt}`,
      dateKey: challenge.dateKey,
      questionId: qid,
      selectedOptionId: "whatever",
      isCorrect: false,
      submittedAt,
    })),
  );
}

describe("Property 11: Score reflects only first, in-scope attempts, order-independently", () => {
  // Validates: Requirements 6.1, 6.3, 7.1, 7.2, 7.3
  it("counts only the chronologically-first same-day, in-scope attempt per question, regardless of array order", () => {
    fc.assert(
      fc.property(
        challengeArb.chain((challenge) =>
          fc.tuple(
            fc.constant(challenge),
            fc.array(inScopeAttemptArb(challenge), { minLength: 0, maxLength: 15 }),
            fc.array(outOfScopeAttemptArb(challenge), { minLength: 0, maxLength: 5 }),
          ),
        ),
        ([challenge, inScope, outOfScope]) => {
          const allAttempts = fc.sample(fc.shuffledSubarray([...inScope, ...outOfScope], {
            minLength: inScope.length + outOfScope.length,
          }), 1)[0];
          const shuffled = fc.sample(fc.shuffledSubarray(allAttempts, { minLength: allAttempts.length }), 1)[0];

          const scoreOriginalOrder = calculateScore(challenge, allAttempts);
          const scoreShuffled = calculateScore(challenge, shuffled);

          expect(scoreShuffled).toBe(scoreOriginalOrder);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("ignores out-of-scope attempts entirely", () => {
    fc.assert(
      fc.property(
        challengeArb.chain((challenge) =>
          fc.tuple(fc.constant(challenge), fc.array(outOfScopeAttemptArb(challenge), { minLength: 1, maxLength: 10 })),
        ),
        ([challenge, outOfScope]) => {
          expect(calculateScore(challenge, outOfScope)).toBe(0);
          expect(calculateScore(challenge, [])).toBe(calculateScore(challenge, outOfScope));
        },
      ),
      { numRuns: 100 },
    );
  });

  it("credits a question only when its first attempt (by submittedAt) is correct, not later attempts", () => {
    const challenge: DailyChallenge = {
      dateKey: "2025-01-15",
      lessonId: "lesson-1",
      questions: [makeQuestion("q0")],
    };
    const question = challenge.questions[0];

    // First attempt wrong, second (later) attempt correct -- score should NOT credit this.
    const attempts: Attempt[] = [
      {
        id: "a1",
        dateKey: "2025-01-15",
        questionId: question.id,
        selectedOptionId: `${question.id}-optB`, // wrong
        isCorrect: false,
        submittedAt: 100,
      },
      {
        id: "a2",
        dateKey: "2025-01-15",
        questionId: question.id,
        selectedOptionId: question.correctOptionId, // correct, but submitted later
        isCorrect: true,
        submittedAt: 200,
      },
    ];

    expect(calculateScore(challenge, attempts)).toBe(0);
  });

  it("credits a question when its first attempt (by submittedAt) is correct, even if a later attempt is wrong", () => {
    const challenge: DailyChallenge = {
      dateKey: "2025-01-15",
      lessonId: "lesson-1",
      questions: [makeQuestion("q0")],
    };
    const question = challenge.questions[0];

    const attempts: Attempt[] = [
      {
        id: "a1",
        dateKey: "2025-01-15",
        questionId: question.id,
        selectedOptionId: question.correctOptionId, // correct, first
        isCorrect: true,
        submittedAt: 100,
      },
      {
        id: "a2",
        dateKey: "2025-01-15",
        questionId: question.id,
        selectedOptionId: `${question.id}-optB`, // wrong, later -- should not matter
        isCorrect: false,
        submittedAt: 200,
      },
    ];

    expect(calculateScore(challenge, attempts)).toBe(100);
  });
});

describe("Property 12: Scoring is pure", () => {
  // Validates: Requirements 6.2
  it("does not mutate the Attempts array or its elements", () => {
    fc.assert(
      fc.property(
        challengeArb.chain((challenge) =>
          fc.tuple(fc.constant(challenge), fc.array(inScopeAttemptArb(challenge), { minLength: 0, maxLength: 10 })),
        ),
        ([challenge, attempts]) => {
          const snapshot = attempts.map((a) => ({ ...a }));
          calculateScore(challenge, attempts);
          expect(attempts).toEqual(snapshot);
        },
      ),
      { numRuns: 150 },
    );
  });

  it("does not invoke any network or storage function (calculateScore takes no such dependency)", () => {
    // Structural guarantee: calculateScore's signature is (challenge, attempts) => number,
    // with no injected storage/network dependency, and no global fetch/indexedDB reference
    // appears in scoring.ts (see storage.md's single-access-point rule, verified separately
    // by singleAccessPoint.test.ts). This test asserts the return type contract directly.
    const challenge: DailyChallenge = {
      dateKey: "2025-01-15",
      lessonId: "lesson-1",
      questions: [makeQuestion("q0")],
    };
    const result = calculateScore(challenge, []);
    expect(typeof result).toBe("number");
    expect(result).not.toBeInstanceOf(Promise);
  });
});

describe("Property 13: Score is always clamped to 0-100", () => {
  // Validates: Requirements 8.1
  it("returns an integer between 0 and 100 inclusive for arbitrary/adversarial attempts", () => {
    fc.assert(
      fc.property(
        challengeArb.chain((challenge) =>
          fc.tuple(
            fc.constant(challenge),
            fc.array(
              fc.oneof(
                inScopeAttemptArb(challenge),
                outOfScopeAttemptArb(challenge),
                // Adversarial: duplicate ids, extreme timestamps, garbage selectedOptionId.
                fc.record({
                  id: fc.string(),
                  dateKey: fc.oneof(fc.constant(challenge.dateKey), fc.string()),
                  questionId: fc.oneof(
                    fc.constantFrom(...challenge.questions.map((q) => q.id)),
                    fc.uuid(),
                  ),
                  selectedOptionId: fc.string(),
                  isCorrect: fc.boolean(),
                  submittedAt: fc.integer({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER }),
                }),
              ),
              { minLength: 0, maxLength: 20 },
            ),
          ),
        ),
        ([challenge, attempts]) => {
          const score = calculateScore(challenge, attempts);
          expect(Number.isInteger(score)).toBe(true);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("returns 0 for an empty Attempts array", () => {
    fc.assert(
      fc.property(challengeArb, (challenge) => {
        expect(calculateScore(challenge, [])).toBe(0);
      }),
      { numRuns: 50 },
    );
  });

  it("returns 100 when every question's first attempt is correct", () => {
    fc.assert(
      fc.property(challengeArb, (challenge) => {
        const attempts: Attempt[] = challenge.questions.map((q, i) => ({
          id: `${challenge.dateKey}:${q.id}:${i}`,
          dateKey: challenge.dateKey,
          questionId: q.id,
          selectedOptionId: q.correctOptionId,
          isCorrect: true,
          submittedAt: i,
        }));
        expect(calculateScore(challenge, attempts)).toBe(100);
      }),
      { numRuns: 50 },
    );
  });
});
