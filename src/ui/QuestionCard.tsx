// QuestionCard: renders one Question's prompt and its 4 Answer_Options as an
// accessible fieldset of radio inputs plus a submit button. Once answered
// (from state or a restored Attempt), options become disabled/read-only and
// FeedbackPanel renders instead.
// See design.md: "UI: QuestionCard", "UI: Challenge_View", "Error Handling table".
// Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2.

import { useId, useState, type FormEvent } from "react";
import { submitAnswer, type GradeResult } from "../domain/grading";
import type { Attempt, Question } from "../domain/types";
import { FeedbackPanel } from "./FeedbackPanel";

export interface QuestionCardProps {
  question: Question;
  /** The recorded Attempt for this question today, if any. */
  priorAttempt: Attempt | undefined;
  dateKey: string;
  /** Called once a new submission is successfully graded, so the caller can persist it. */
  onAnswered: (attempt: Attempt) => void;
  /**
   * When provided, a "Next Question" button renders once this question is
   * answered, letting the caller advance the one-by-one question flow.
   * Omitted entirely on the last question of a challenge (there's nothing
   * to advance to -- the caller shows a milestone/summary instead).
   */
  onNext?: () => void;
  /** Label for the advance button, e.g. "See results" on the last question. */
  nextLabel?: string;
}

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

function gradeResultFromAttempt(question: Question, attempt: Attempt): GradeResult {
  return {
    isCorrect: attempt.isCorrect,
    correctOptionId: question.correctOptionId,
    explanation: question.explanation,
    sourceQuote: question.sourceQuote,
  };
}

export function QuestionCard({
  question,
  priorAttempt,
  dateKey,
  onAnswered,
  onNext,
  nextLabel = "Next Question",
}: QuestionCardProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const errorId = useId();

  const answered = priorAttempt !== undefined;
  const gradeResult = priorAttempt
    ? gradeResultFromAttempt(question, priorAttempt)
    : undefined;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Requirement 4.3: an already-answered question never accepts, evaluates,
    // or records a further submission -- the UI itself blocks it here in
    // addition to submitAnswer's own guard, since the form shouldn't be
    // interactive once answered.
    if (answered) return;

    const outcome = submitAnswer(question, selectedOptionId, priorAttempt, dateKey);

    if (!outcome.ok) {
      if (outcome.error.kind === "invalid-option") {
        // Requirement 4.4: reject missing/invalid options with an inline error.
        setError("Please select an answer before submitting.");
        return;
      }
      // "already-answered" -- defensive; the UI already disables re-submission,
      // so this path is only reachable if state briefly desynced. Nothing to
      // record; the existing FeedbackPanel (driven by priorAttempt) already
      // reflects the correct state on next render.
      return;
    }

    setError(undefined);
    onAnswered(outcome.attempt);
  }

  return (
    <div className="question-card" data-testid="question-card">
      <form onSubmit={handleSubmit}>
        <fieldset disabled={answered}>
          <legend className="question-prompt">{question.prompt}</legend>
          <div
            role="radiogroup"
            aria-describedby={error ? errorId : undefined}
            className="option-list"
          >
            {question.options.map((option, index) => {
              const optionInputId = `${question.id}-${option.id}`;
              const isSelected = answered
                ? priorAttempt?.selectedOptionId === option.id
                : selectedOptionId === option.id;
              // Visual reinforcement only; FeedbackPanel states the result in text.
              const result = !answered
                ? undefined
                : option.id === question.correctOptionId
                  ? "correct"
                  : isSelected
                    ? "incorrect"
                    : undefined;
              return (
                <label
                  key={option.id}
                  htmlFor={optionInputId}
                  className="option-label"
                  data-selected={isSelected}
                  data-result={result}
                >
                  <input
                    type="radio"
                    id={optionInputId}
                    name={`question-${question.id}`}
                    value={option.id}
                    checked={isSelected}
                    disabled={answered}
                    onChange={() => setSelectedOptionId(option.id)}
                  />
                  <span className="option-letter" aria-hidden="true">
                    {OPTION_LETTERS[index] ?? index + 1}
                  </span>
                  <span className="option-text">{option.text}</span>
                </label>
              );
            })}
          </div>
          {error && (
            <p id={errorId} role="alert" className="option-error" data-testid="option-error">
              {error}
            </p>
          )}
          {!answered && (
            <button type="submit" className="submit-answer primary-button">
              Submit
            </button>
          )}
        </fieldset>
      </form>

      {answered && gradeResult && (
        <FeedbackPanel
          isCorrect={gradeResult.isCorrect}
          correctOptionText={
            question.options.find((o) => o.id === gradeResult.correctOptionId)?.text ?? ""
          }
          explanation={gradeResult.explanation}
          sourceQuote={gradeResult.sourceQuote}
        />
      )}

      {answered && onNext && (
        <div className="next-question-row">
          <button type="button" className="next-question" onClick={onNext}>
            {nextLabel}
          </button>
        </div>
      )}
    </div>
  );
}
