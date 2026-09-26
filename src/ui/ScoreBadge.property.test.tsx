import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { render, screen } from "@testing-library/react";
import { ScoreBadge } from "./ScoreBadge";
import { calculateScore } from "../domain/scoring";
import { makeChallenge } from "./testFixtures";
import type { Attempt } from "../domain/types";

const challenge = makeChallenge();

/** An Attempt for one of the challenge's questions, correct or wrong, in-scope. */
const attemptArb: fc.Arbitrary<Attempt> = fc
  .tuple(
    fc.constantFrom(...challenge.questions),
    fc.integer({ min: 0, max: 1_000_000 }),
  )
  .chain(([question, submittedAt]) =>
    fc.constantFrom(...question.options.map((o) => o.id)).map((selectedOptionId) => ({
      id: `${challenge.dateKey}:${question.id}:${submittedAt}`,
      dateKey: challenge.dateKey,
      questionId: question.id,
      selectedOptionId,
      isCorrect: selectedOptionId === question.correctOptionId,
      submittedAt,
    })),
  );

describe("Property 14: Displayed score matches the pure calculation", () => {
  // Validates: Requirements 8.3
  it("renders a score equal to calculateScore(challenge, attempts) for any non-empty attempts array", () => {
    fc.assert(
      fc.property(
        fc.array(attemptArb, { minLength: 1, maxLength: 10 }),
        (attempts) => {
          const expected = calculateScore(challenge, attempts);
          const { unmount } = render(<ScoreBadge challenge={challenge} attempts={attempts} />);

          const badge = screen.getByTestId("score-badge");
          expect(badge).toHaveTextContent(`${expected}%`);

          unmount();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('renders "Not assessed yet" for an empty attempts array', () => {
    render(<ScoreBadge challenge={challenge} attempts={[]} />);
    expect(screen.getByTestId("score-badge")).toHaveTextContent("Not assessed yet");
  });
});
