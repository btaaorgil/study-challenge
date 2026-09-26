import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { StudyCalendarView } from "./StudyCalendarView";
import { createStorageLayer } from "../storage/db";
import type { DailyChallenge, Question } from "../domain/types";

function makeQuestion(id: string): Question {
  return {
    id,
    sectionId: "s1",
    conceptId: "c1",
    prompt: "Prompt",
    options: [
      { id: `${id}-a`, text: "A" },
      { id: `${id}-b`, text: "B" },
    ],
    correctOptionId: `${id}-a`,
    explanation: "Because A.",
    sourceQuote: "A",
  };
}

let dbCounter = 0;
async function freshStorage() {
  dbCounter += 1;
  const { storage } = createStorageLayer(new IDBFactory(), `calendar-view-${dbCounter}`);
  await storage.init();
  return storage;
}

const APRIL_10 = () => new Date(2025, 3, 10, 12, 0, 0);

async function answered(storage: Awaited<ReturnType<typeof freshStorage>>, dateKey: string, correct: boolean[]) {
  const challenge: DailyChallenge = {
    dateKey,
    lessonId: "lesson-1",
    questions: correct.map((_, i) => makeQuestion(`${dateKey}-q${i}`)),
  };
  await storage.putDailyChallenge(challenge);
  for (const [i, isCorrect] of correct.entries()) {
    const q = challenge.questions[i];
    await storage.putAttempt({
      id: `${q.id}-attempt`,
      dateKey,
      questionId: q.id,
      selectedOptionId: isCorrect ? q.correctOptionId : `${q.id}-b`,
      isCorrect,
      submittedAt: i + 1,
    });
  }
}

describe("StudyCalendarView: month grid of study activity", () => {
  it("renders the current month and an empty state when nothing has been done", async () => {
    const storage = await freshStorage();
    render(<StudyCalendarView storage={storage} now={APRIL_10} />);

    await waitFor(() => {
      expect(screen.getByText(/nothing here yet/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("table", { name: /april 2025/i })).toBeInTheDocument();
    expect(screen.getByTestId("calendar-day-2025-04-10")).toHaveClass("calendar-cell--today");
  });

  it("tints each day by its score and labels it for screen readers", async () => {
    const storage = await freshStorage();
    await answered(storage, "2025-04-08", [true, true]); // 100%
    await answered(storage, "2025-04-09", [true, false]); // 50%
    await answered(storage, "2025-04-10", [false, false]); // 0%

    render(<StudyCalendarView storage={storage} now={APRIL_10} />);

    await waitFor(() => {
      expect(screen.getByTestId("calendar-day-2025-04-08")).toHaveClass("calendar-cell--high");
    });
    expect(screen.getByTestId("calendar-day-2025-04-09")).toHaveClass("calendar-cell--mid");
    expect(screen.getByTestId("calendar-day-2025-04-10")).toHaveClass("calendar-cell--low");
    expect(screen.getByTestId("calendar-day-2025-04-08")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("100% (2 of 2 answered)"),
    );
  });

  it("computes the streak and best score", async () => {
    const storage = await freshStorage();
    await answered(storage, "2025-04-08", [true, true]);
    await answered(storage, "2025-04-09", [true, false]);
    await answered(storage, "2025-04-10", [true, false]);
    await answered(storage, "2025-04-05", [true, true]); // not contiguous

    render(<StudyCalendarView storage={storage} now={APRIL_10} />);

    await waitFor(() => {
      expect(screen.getByText("3 days")).toBeInTheDocument();
    });
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("marks exam days and ignores 'exam:' challenge records", async () => {
    const storage = await freshStorage();
    await storage.putDailyChallenge({
      dateKey: "exam:2025-04-03:lesson-1",
      lessonId: "lesson-1",
      questions: [makeQuestion("eq1")],
    });
    await storage.putExamResult({
      id: "r1",
      lessonId: "lesson-1",
      dateKey: "2025-04-03",
      difficulty: "normal",
      correct: 4,
      total: 5,
      bySection: [],
      finishedAt: 1,
    });

    render(<StudyCalendarView storage={storage} now={APRIL_10} />);

    await waitFor(() => {
      expect(screen.getByTestId("calendar-day-2025-04-03")).toHaveClass("calendar-cell--exam");
    });
    expect(screen.getByTestId("calendar-day-2025-04-03")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("1 exam taken"),
    );
  });

  it("navigates between months", async () => {
    const user = userEvent.setup();
    const storage = await freshStorage();
    render(<StudyCalendarView storage={storage} now={APRIL_10} />);

    await screen.findByRole("table", { name: /april 2025/i });
    await user.click(screen.getByRole("button", { name: /previous month/i }));
    expect(screen.getByRole("table", { name: /march 2025/i })).toBeInTheDocument();
  });
});
