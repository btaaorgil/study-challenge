// End-to-end smoke test for the full Phase 1 daily-challenge flow, using the
// bundled SAMPLE_LESSON: generate -> answer all 5 -> grade -> score ->
// persist, with network access mocked and asserted never used.
// See design.md: "Testing Strategy". Requirements: 10.2, 10.3.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createStorageLayer } from "./storage/db";
import { SAMPLE_LESSON } from "./data/sampleLesson";
import { getOrCreateDailyChallenge, formatLocalDate } from "./domain/challenge";
import { submitAnswer } from "./domain/grading";
import { calculateScore } from "./domain/scoring";

describe("End-to-end smoke test: full daily-challenge flow (Requirements 10.2, 10.3)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn(() => {
      throw new Error("No network call should occur anywhere in the daily-challenge flow");
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("generates, answers, grades, scores, and persists a full Daily_Challenge with zero network calls", async () => {
    const { storage, getStatus } = createStorageLayer(new IDBFactory(), "smoke-e2e-db");
    await storage.init();
    expect(getStatus()).toEqual({ kind: "ok" });

    const dateKey = formatLocalDate(new Date(2025, 0, 15));

    // 1. Generate the Daily_Challenge from the bundled Sample_Lesson.
    const challenge = await getOrCreateDailyChallenge(dateKey, SAMPLE_LESSON, storage);
    expect(challenge.questions).toHaveLength(5);
    for (const question of challenge.questions) {
      expect(question.options).toHaveLength(4);
      expect(question.options.some((o) => o.id === question.correctOptionId)).toBe(true);
      expect(question.explanation.length).toBeGreaterThan(0);
      expect(question.sourceQuote.length).toBeGreaterThan(0);
    }

    // 2. Answer all 5 questions (deliberately: first 3 correct, last 2 wrong)
    //    to exercise both grading outcomes end-to-end.
    let expectedCorrectCount = 0;
    for (const [index, question] of challenge.questions.entries()) {
      const answerCorrectly = index < 3;
      expectedCorrectCount += answerCorrectly ? 1 : 0;

      const chosenOptionId = answerCorrectly
        ? question.correctOptionId
        : question.options.find((o) => o.id !== question.correctOptionId)!.id;

      const priorAttempt = (await storage.getAttempts(dateKey)).find(
        (a) => a.questionId === question.id,
      );
      const outcome = submitAnswer(question, chosenOptionId, priorAttempt, dateKey);

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) continue;
      expect(outcome.result.isCorrect).toBe(answerCorrectly);
      expect(outcome.result.correctOptionId).toBe(question.correctOptionId);

      // 3. Persist each Attempt through the Storage_Layer.
      await storage.putAttempt(outcome.attempt);
    }

    // 4. Verify persistence: reading back attempts for the day reflects all 5.
    const persistedAttempts = await storage.getAttempts(dateKey);
    expect(persistedAttempts).toHaveLength(5);

    // 5. Verify scoring: 3 out of 5 correct -> 60%.
    const score = calculateScore(challenge, persistedAttempts);
    expect(expectedCorrectCount).toBe(3);
    expect(score).toBe(60);

    // 6. Verify the Daily_Challenge itself was persisted and reloading it is
    //    stable (same day -> same challenge, per Requirement 3.5/9.5).
    const reloadedChallenge = await getOrCreateDailyChallenge(dateKey, SAMPLE_LESSON, storage);
    expect(reloadedChallenge).toEqual(challenge);

    // 7. No network call occurred anywhere in this flow.
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(getStatus()).toEqual({ kind: "ok" });
  });
});
