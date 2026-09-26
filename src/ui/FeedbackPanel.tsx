// FeedbackPanel: shows correct/incorrect status, the correct answer text,
// an explanation, and the exact supporting source quote.
// See design.md: "UI: FeedbackPanel". Requirements: 4.2, 5.1, 5.2.

export interface FeedbackPanelProps {
  isCorrect: boolean;
  correctOptionText: string;
  explanation: string;
  sourceQuote: string;
}

export function FeedbackPanel({
  isCorrect,
  correctOptionText,
  explanation,
  sourceQuote,
}: FeedbackPanelProps) {
  return (
    // aria-live="polite" so screen readers announce the result as soon as it
    // appears, without interrupting whatever the user was doing (Req 4.2).
    // The correct/incorrect tint is a visual reinforcement only -- the status
    // text itself ("Correct!"/"Incorrect.") always carries the meaning, so
    // color is never the sole information carrier.
    <div
      className={`feedback-panel ${isCorrect ? "correct" : "incorrect"}`}
      role="status"
      aria-live="polite"
      data-testid="feedback-panel"
    >
      <p className="feedback-status">
        {isCorrect ? "Correct!" : "Incorrect."} The correct answer is:{" "}
        <strong>{correctOptionText}</strong>
      </p>
      <p className="feedback-explanation">{explanation}</p>
      <blockquote className="feedback-source-quote" data-testid="feedback-source-quote">
        {sourceQuote}
      </blockquote>
    </div>
  );
}
