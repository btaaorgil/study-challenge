import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
function freshStorage() {
  dbCounter += 1;
  return createStorageLayer(new IDBFactory(), `calendar-view-${dbCounter}`);
}

describe("StudyCalendarView: study history and milestones", () => {
  it("shows an empty state when nothing has been completed yet", async () => {
    const { storage } = freshStorage();
    await storage.init();
    render(<StudyCalendarView storage={storage} />);

    await waitFor(() => {
      expect(screen.getByText(/no challenges completed yet/i)).toBeInTheDocument();
    });
  });

  it("lists a persisted day with its score and flags a perfect score as a milestone", async () => {
    const { storage } = freshStorage();
    await storage.init();

    const challenge: DailyChallenge = {
      dateKey: "2025-04-01",
      lessonId: "lesson-1",
      questions: [makeQuestion("q1"), makeQuestion("q2")],
    };
    await storage.putDailyChallenge(challenge);
    await storage.putAttempt({
      id: "a1",
      dateKey: "2025-04-01",
      questionId: "q1",
      selectedOptionId: "q1-a",
      isCorrect: true,
      submittedAt: 1,
    });
    await storage.putAttempt({
      id: "a2",
      dateKey: "2025-04-01",
      questionId: "q2",
      selectedOptionId: "q2-a",
      isCorrect: true,
      submittedAt: 2,
    });

    render(<StudyCalendarView storage={storage} />);

    await waitFor(() => {
      expect(screen.getByText("100%")).toBeInTheDocument();
    });
    expect(screen.getByText(/perfect score/i)).toBeInTheDocument();
  });

  it("does not flag a milestone for a non-perfect score", async () => {
    const { storage } = freshStorage();
    await storage.init();

    const challenge: DailyChallenge = {
      dateKey: "2025-04-02",
      lessonId: "lesson-1",
      questions: [makeQuestion("q3"), makeQuestion("q4")],
    };
    await storage.putDailyChallenge(challenge);
    await storage.putAttempt({
      id: "a3",
      dateKey: "2025-04-02",
      questionId: "q3",
      selectedOptionId: "q3-b", // wrong
      isCorrect: false,
      submittedAt: 1,
    });

    render(<StudyCalendarView storage={storage} />);

    await waitFor(() => {
      expect(screen.getByText("0%")).toBeInTheDocument();
    });
    expect(screen.queryByText(/perfect score/i)).not.toBeInTheDocument();
  });

  it("excludes exam-mode entries (dateKey prefixed 'exam:') from the calendar list", async () => {
    const { storage } = freshStorage();
    await storage.init();

    await storage.putDailyChallenge({
      dateKey: "exam:2025-04-03:lesson-1",
      lessonId: "lesson-1",
      questions: [makeQuestion("eq1")],
    });

    render(<StudyCalendarView storage={storage} />);

    await waitFor(() => {
      expect(screen.getByText(/no challenges completed yet/i)).toBeInTheDocument();
    });
  });
});
