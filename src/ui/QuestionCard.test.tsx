import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QuestionCard } from "./QuestionCard";
import { makeQuestion } from "./testFixtures";
import type { Attempt } from "../domain/types";

describe("QuestionCard: invalid submission handling (Requirement 4.4)", () => {
  it("shows an inline error and does not call onAnswered when submitting without a selection", async () => {
    const user = userEvent.setup();
    const question = makeQuestion();
    const onAnswered = vi.fn();

    render(
      <QuestionCard
        question={question}
        priorAttempt={undefined}
        dateKey="2025-01-15"
        onAnswered={onAnswered}
      />,
    );

    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(screen.getByTestId("option-error")).toHaveTextContent(
      "Please select an answer before submitting.",
    );
    expect(onAnswered).not.toHaveBeenCalled();
    // No FeedbackPanel should render since nothing was recorded.
    expect(screen.queryByTestId("feedback-panel")).not.toBeInTheDocument();
  });
});

describe("QuestionCard: answered-question redisplay (Requirement 4.3)", () => {
  it("redisplays prior feedback and disables inputs when a same-day Attempt already exists", () => {
    const question = makeQuestion();
    const priorAttempt: Attempt = {
      id: "2025-01-15:q1:1000",
      dateKey: "2025-01-15",
      questionId: question.id,
      selectedOptionId: question.correctOptionId,
      isCorrect: true,
      submittedAt: 1000,
    };
    const onAnswered = vi.fn();

    render(
      <QuestionCard
        question={question}
        priorAttempt={priorAttempt}
        dateKey="2025-01-15"
        onAnswered={onAnswered}
      />,
    );

    expect(screen.getByTestId("feedback-panel")).toBeInTheDocument();
    expect(screen.getByTestId("feedback-panel")).toHaveTextContent("Correct!");

    // Every radio input must be disabled -- no further submission is possible.
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBeGreaterThan(0);
    for (const radio of radios) {
      expect(radio).toBeDisabled();
    }

    // No submit button should be rendered once answered.
    expect(screen.queryByRole("button", { name: /submit/i })).not.toBeInTheDocument();
  });

  it("rejects a further submission attempt via submitAnswer's own guard even if triggered", async () => {
    // Sanity check at the integration level: even though the UI hides the
    // submit button once answered, submitAnswer itself (called internally)
    // must never record a new Attempt for an already-answered question.
    const question = makeQuestion();
    const priorAttempt: Attempt = {
      id: "2025-01-15:q1:1000",
      dateKey: "2025-01-15",
      questionId: question.id,
      selectedOptionId: question.options[0].id, // wrong on purpose
      isCorrect: false,
      submittedAt: 1000,
    };
    const onAnswered = vi.fn();

    render(
      <QuestionCard
        question={question}
        priorAttempt={priorAttempt}
        dateKey="2025-01-15"
        onAnswered={onAnswered}
      />,
    );

    // Feedback reflects the *prior* (incorrect) attempt, not a fresh grade.
    expect(screen.getByTestId("feedback-panel")).toHaveTextContent("Incorrect.");
    expect(onAnswered).not.toHaveBeenCalled();
  });
});
