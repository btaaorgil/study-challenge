import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExamView } from "./ExamView";
import type { Lesson } from "../domain/types";

function makeLesson(): Lesson {
  return {
    id: "exam-view-lesson",
    title: "Exam View Lesson",
    sections: [0, 1, 2, 3].map((i) => ({
      id: `s${i}`,
      title: `Section ${i}`,
      explanation: `Explanation for section ${i}.`,
      concepts: [0, 1].map((j) => ({
        id: `s${i}-c${j}`,
        text: `Fact ${i}-${j} about this topic`,
        explanation: `Why fact ${i}-${j} is true.`,
        sourceQuote: `Fact ${i}-${j}`,
      })),
    })),
  };
}

// These tests drive a full 8-question exam via realistic userEvent
// interactions (24 simulated clicks total), which is legitimately slower
// than the default 5s test timeout under load -- given an explicit, longer
// timeout rather than trimmed down, since the multi-step flow itself is
// what's under test.
const EXAM_FLOW_TIMEOUT_MS = 20000;

describe("ExamView: comprehensive multi-section exam flow", () => {
  it(
    "shows a progress bar and lets the student answer through to a final summary",
    async () => {
      const user = userEvent.setup();
      const lesson = makeLesson();
      const fixedDate = () => new Date(2025, 5, 1);

      render(<ExamView lesson={lesson} onExit={vi.fn()} now={fixedDate} />);

      expect(screen.getByText(/question 1 of 8/i)).toBeInTheDocument();

      // Answer all 8 questions (4 sections x 2 questions each, per buildExam's default).
      for (let i = 0; i < 8; i++) {
        const radios = screen.getAllByRole("radio");
        await user.click(radios[0]);
        await user.click(screen.getByRole("button", { name: /submit/i }));

        expect(screen.getByTestId("feedback-panel")).toBeInTheDocument();

        const nextButton = screen.getByRole("button", { name: /next question|see results/i });
        await user.click(nextButton);
      }

      expect(screen.getByTestId("exam-summary")).toBeInTheDocument();
    },
    EXAM_FLOW_TIMEOUT_MS,
  );

  it(
    "calls onExit when leaving the results screen",
    async () => {
      const user = userEvent.setup();
      const lesson = makeLesson();
      const onExit = vi.fn();

      render(<ExamView lesson={lesson} onExit={onExit} now={() => new Date(2025, 5, 1)} />);

      for (let i = 0; i < 8; i++) {
        const radios = screen.getAllByRole("radio");
        await user.click(radios[0]);
        await user.click(screen.getByRole("button", { name: /submit/i }));
        await user.click(screen.getByRole("button", { name: /next question|see results/i }));
      }

      await user.click(screen.getByRole("button", { name: /back to daily challenge/i }));
      expect(onExit).toHaveBeenCalledTimes(1);
    },
    EXAM_FLOW_TIMEOUT_MS,
  );
});
