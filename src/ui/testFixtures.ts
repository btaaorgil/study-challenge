// Shared fixtures for UI component tests.
import type { DailyChallenge, Question } from "../domain/types";

export function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    sectionId: "s1",
    conceptId: "c1",
    prompt: "What is 2 + 2?",
    options: [
      { id: "q1-optA", text: "3" },
      { id: "q1-optB", text: "4" },
      { id: "q1-optC", text: "5" },
      { id: "q1-optD", text: "22" },
    ],
    correctOptionId: "q1-optB",
    explanation: "2 + 2 equals 4 by basic arithmetic.",
    sourceQuote: "2 + 2 equals 4",
    ...overrides,
  };
}

export function makeChallenge(overrides: Partial<DailyChallenge> = {}): DailyChallenge {
  return {
    dateKey: "2025-01-15",
    lessonId: "lesson-1",
    questions: [
      makeQuestion({ id: "q1" }),
      makeQuestion({ id: "q2" }),
      makeQuestion({ id: "q3" }),
      makeQuestion({ id: "q4" }),
      makeQuestion({ id: "q5" }),
    ],
    ...overrides,
  };
}
