// ChallengeView: the top-level Daily Study Challenge screen. On mount,
// resolves dateKey, loads/creates the day's DailyChallenge and its Attempts
// via the domain+storage layers, holds them in React state, and re-renders
// on every submitAnswer.
// See design.md: "UI: Challenge_View" (mermaid tree), "Error Handling table".
// Requirements: 3.1, 3.5, 9.5.

import { useCallback, useEffect, useState } from "react";
import { formatLocalDate, getOrCreateDailyChallenge } from "../domain/challenge";
import type { Attempt, DailyChallenge, Lesson } from "../domain/types";
import type { StorageLayer, StorageStatus } from "../storage/db";
import { QuestionCard } from "./QuestionCard";
import { ScoreBadge } from "./ScoreBadge";
import { StorageFallbackBanner } from "./StorageFallbackBanner";

export interface ChallengeViewProps {
  lesson: Lesson;
  storage: StorageLayer;
  getStorageStatus: () => StorageStatus;
  /** Injectable clock, primarily for tests. Defaults to the real current time. */
  now?: () => Date;
}

interface LoadedState {
  dateKey: string;
  challenge: DailyChallenge;
  attempts: Attempt[];
}

export function ChallengeView({
  lesson,
  storage,
  getStorageStatus,
  now = () => new Date(),
}: ChallengeViewProps) {
  const [state, setState] = useState<LoadedState | undefined>(undefined);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>(getStorageStatus());

  const load = useCallback(async (dateKey: string) => {
    const challenge = await getOrCreateDailyChallenge(dateKey, lesson, storage);
    const attempts = await storage.getAttempts(dateKey);
    setState({ dateKey, challenge, attempts });
    setStorageStatus(getStorageStatus());
  }, [lesson, storage, getStorageStatus]);

  useEffect(() => {
    void load(formatLocalDate(now()));
    // Requirement 9.5: recompute dateKey (and reload) whenever the app
    // regains focus, so a session left open across midnight picks up the
    // new day's challenge.
    function handleFocus() {
      void load(formatLocalDate(now()));
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [load]);

  const handleAnswered = useCallback(
    (attempt: Attempt) => {
      setState((prev) => {
        if (!prev) return prev;
        return { ...prev, attempts: [...prev.attempts, attempt] };
      });
      void storage.putAttempt(attempt).then(() => {
        setStorageStatus(getStorageStatus());
      });
    },
    [storage, getStorageStatus],
  );

  if (!state) {
    return (
      <main className="challenge-view">
        <p role="status">Loading today&apos;s challenge&hellip;</p>
      </main>
    );
  }

  const { challenge, attempts, dateKey } = state;
  const attemptByQuestionId = new Map(attempts.map((a) => [a.questionId, a]));

  return (
    <main className="challenge-view">
      <StorageFallbackBanner status={storageStatus} />
      <h1>Daily Study Challenge</h1>
      <ScoreBadge challenge={challenge} attempts={attempts} />
      <ol className="question-list">
        {challenge.questions.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            priorAttempt={attemptByQuestionId.get(question.id)}
            dateKey={dateKey}
            onAnswered={handleAnswered}
          />
        ))}
      </ol>
    </main>
  );
}
