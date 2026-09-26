import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { ChallengeView } from "./ChallengeView";
import { createStorageLayer } from "../storage/db";
import { formatLocalDate } from "../domain/challenge";
import type { Lesson } from "../domain/types";

const lesson: Lesson = {
  id: "lesson-1",
  title: "Sample",
  sections: [
    {
      id: "s0",
      title: "Section A",
      explanation: "Explanation A",
      concepts: [{ id: "c0", text: "fact zero", explanation: "why zero", sourceQuote: "fact zero" }],
    },
    {
      id: "s1",
      title: "Section B",
      explanation: "Explanation B",
      concepts: [{ id: "c1", text: "fact one", explanation: "why one", sourceQuote: "fact one" }],
    },
    {
      id: "s2",
      title: "Section C",
      explanation: "Explanation C",
      concepts: [{ id: "c2", text: "fact two", explanation: "why two", sourceQuote: "fact two" }],
    },
    {
      id: "s3",
      title: "Section D",
      explanation: "Explanation D",
      concepts: [{ id: "c3", text: "fact three", explanation: "why three", sourceQuote: "fact three" }],
    },
  ],
};

let dbCounter = 0;
function freshStorage() {
  dbCounter += 1;
  return createStorageLayer(new IDBFactory(), `challengeview-test-${dbCounter}`);
}

describe("ChallengeView: local-date dateKey computation (Requirement 9.5)", () => {
  it("computes dateKey from local date components, not UTC, near a UTC-offset boundary", () => {
    // 2025-01-15 23:30 in a timezone far ahead of UTC (e.g. UTC+14) would be
    // 2025-01-15 09:30 UTC -- same calendar day either way, so pick a moment
    // that actually straddles midnight in local time vs UTC to prove local
    // components (not UTC) are used: 23:30 local time, but represented as a
    // Date object constructed from explicit local components.
    const localMidnightEve = new Date(2025, 0, 15, 23, 30, 0); // Jan 15, 2025, 23:30 local
    const dateKey = formatLocalDate(localMidnightEve);
    expect(dateKey).toBe("2025-01-15");

    // And the next local moment (past local midnight) rolls over to the 16th,
    // regardless of what the UTC calendar date might say.
    const justAfterLocalMidnight = new Date(2025, 0, 16, 0, 5, 0); // Jan 16, 2025, 00:05 local
    expect(formatLocalDate(justAfterLocalMidnight)).toBe("2025-01-16");
  });

  it("loads and renders the Daily_Challenge for the date returned by the injected clock", async () => {
    const { storage, getStatus } = freshStorage();
    await storage.init();

    const fixedDate = new Date(2025, 0, 15, 10, 0, 0);
    render(
      <ChallengeView
        lesson={lesson}
        storage={storage}
        getStorageStatus={getStatus}
        now={() => fixedDate}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByTestId("question-card")).toHaveLength(5);
    });

    const persisted = await storage.getDailyChallenge(formatLocalDate(fixedDate));
    expect(persisted).toBeDefined();
    expect(persisted?.dateKey).toBe("2025-01-15");
  });
});
