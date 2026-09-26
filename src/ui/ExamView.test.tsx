import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { ExamView } from "./ExamView";
import { createStorageLayer } from "../storage/db";
import type { Lesson } from "../domain/types";

function makeLesson(): Lesson {
  return {
    id: "exam-view-lesson",
    title: "Exam View Lesson",
    sections: [0, 1, 2].map((i) => ({
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

// Drives a full 6-question exam through real clicks; slower than the 5s default under load.
const EXAM_FLOW_TIMEOUT_MS = 20000;

async function answerAll(user: ReturnType<typeof userEvent.setup>, count: number) {
  for (let i = 0; i < count; i++) {
    await user.click(screen.getAllByRole("radio")[0]);
    await user.click(screen.getByRole("button", { name: /submit/i }));
    expect(screen.getByTestId("feedback-panel")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /next question|see results/i }));
  }
}

describe("ExamView: Test Yourself over the whole lesson", () => {
  it(
    "covers every concept, shows a per-topic breakdown, and saves the result",
    async () => {
      const user = userEvent.setup();
      const { storage } = createStorageLayer(new IDBFactory(), "exam-view-1");
      await storage.init();
      const onFinished = vi.fn();

      render(
        <ExamView
          lesson={makeLesson()}
          onExit={vi.fn()}
          storage={storage}
          onFinished={onFinished}
          seed="fixed"
          now={() => new Date(2025, 5, 1)}
        />,
      );

      // 3 topics x 2 points each = 6 questions.
      expect(screen.getByText(/question 1 of 6/i)).toBeInTheDocument();
      await answerAll(user, 6);

      const summary = screen.getByTestId("exam-summary");
      expect(summary).toBeInTheDocument();
      expect(screen.getByRole("list", { name: /score by topic/i }).children).toHaveLength(3);

      expect(onFinished).toHaveBeenCalledTimes(1);
      const result = onFinished.mock.calls[0][0];
      expect(result.total).toBe(6);
      expect(result.dateKey).toBe("2025-06-01");
      await waitFor(async () => {
        expect(await storage.listExamResults()).toHaveLength(1);
      });
    },
    EXAM_FLOW_TIMEOUT_MS,
  );

  it(
    "uses 3 options per question on Easy",
    () => {
      render(<ExamView lesson={makeLesson()} onExit={vi.fn()} difficulty="easy" seed="fixed" />);
      expect(screen.getAllByRole("radio")).toHaveLength(3);
      expect(screen.getByText("Easy")).toBeInTheDocument();
    },
  );

  it(
    "retakes with a fresh run and calls onExit from the results screen",
    async () => {
      const user = userEvent.setup();
      const onExit = vi.fn();
      render(<ExamView lesson={makeLesson()} onExit={onExit} seed="fixed" now={() => new Date(2025, 5, 1)} />);

      await answerAll(user, 6);
      await user.click(screen.getByRole("button", { name: /retake with new questions/i }));
      expect(screen.getByText(/question 1 of 6/i)).toBeInTheDocument();

      await answerAll(user, 6);
      await user.click(screen.getByRole("button", { name: /back to dashboard/i }));
      expect(onExit).toHaveBeenCalledTimes(1);
    },
    EXAM_FLOW_TIMEOUT_MS * 2,
  );
});
