// ChallengeView: today's 5-question Daily Challenge. On mount resolves the
// local dateKey, loads/creates the day's DailyChallenge at the chosen
// difficulty, restores its Attempts, and walks through the questions one at
// a time with the topic insight panel beside the question.
// Requirements: 3.1, 3.5, 4, 5, 8, 9.5, 11.

import { useCallback, useEffect, useRef, useState } from "react";
import { formatLocalDate, getOrCreateDailyChallenge } from "../domain/challenge";
import { calculateScore } from "../domain/scoring";
import type { Attempt, DailyChallenge, Difficulty, Lesson } from "../domain/types";
import type { StorageLayer, StorageStatus } from "../storage/db";
import { QuestionCard } from "./QuestionCard";
import { ScoreBadge } from "./ScoreBadge";
import { StorageFallbackBanner } from "./StorageFallbackBanner";
import { ProgressBar } from "./ProgressBar";
import { InsightCard } from "./InsightCard";

export interface ChallengeViewProps {
  lesson: Lesson;
  storage: StorageLayer;
  getStorageStatus: () => StorageStatus;
  difficulty?: Difficulty;
  /** Back to the lesson dashboard. */
  onExit?: () => void;
  /** Jump straight into a Test Yourself exam from the results screen. */
  onStartExam?: () => void;
  /** Injectable clock, primarily for tests. Defaults to the real current time. */
  now?: () => Date;
}

interface LoadedState {
  dateKey: string;
  challenge: DailyChallenge;
  attempts: Attempt[];
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

export function ChallengeView({
  lesson,
  storage,
  getStorageStatus,
  difficulty = "normal",
  onExit,
  onStartExam,
  now = () => new Date(),
}: ChallengeViewProps) {
  const [state, setState] = useState<LoadedState | undefined>(undefined);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>(getStorageStatus());
  const [cursor, setCursor] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const loadedKey = useRef<string | undefined>(undefined);

  const load = useCallback(
    async (dateKey: string) => {
      const challenge = await getOrCreateDailyChallenge(dateKey, lesson, storage, difficulty);
      const attempts = await storage.getAttempts(dateKey);
      const questionIds = new Set(challenge.questions.map((q) => q.id));
      const relevant = attempts.filter((a) => questionIds.has(a.questionId));

      // Only move the cursor when the day/challenge actually changed, not on
      // every window refocus.
      const key = `${dateKey}|${challenge.questions.map((q) => q.id).join(",")}`;
      if (loadedKey.current !== key) {
        loadedKey.current = key;
        const firstOpen = challenge.questions.findIndex(
          (q) => !relevant.some((a) => a.questionId === q.id),
        );
        setCursor(firstOpen === -1 ? challenge.questions.length - 1 : firstOpen);
        setShowResults(firstOpen === -1);
      }
      setState({ dateKey, challenge, attempts: relevant });
      setStorageStatus(getStorageStatus());
    },
    [lesson, storage, getStorageStatus, difficulty],
  );

  useEffect(() => {
    void load(formatLocalDate(now()));
    // Requirement 9.5: re-check the local date whenever the app regains focus,
    // so a tab left open past midnight picks up the new day's challenge.
    function handleFocus() {
      void load(formatLocalDate(now()));
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [load]);

  const handleAnswered = useCallback(
    (attempt: Attempt) => {
      setState((prev) => (prev ? { ...prev, attempts: [...prev.attempts, attempt] } : prev));
      void storage.putAttempt(attempt).then(() => setStorageStatus(getStorageStatus()));
    },
    [storage, getStorageStatus],
  );

  if (!state) {
    return (
      <main className="app-shell">
        <p className="loading-state" role="status">
          Loading today&apos;s challenge&hellip;
        </p>
      </main>
    );
  }

  const { challenge, attempts, dateKey } = state;
  const attemptByQuestionId = new Map(attempts.map((a) => [a.questionId, a]));
  const totalQuestions = challenge.questions.length;
  const answeredCount = challenge.questions.filter((q) => attemptByQuestionId.has(q.id)).length;
  const allAnswered = answeredCount >= totalQuestions;
  const currentQuestion = challenge.questions[Math.min(cursor, totalQuestions - 1)];
  const currentAttempt = currentQuestion ? attemptByQuestionId.get(currentQuestion.id) : undefined;
  const isLastQuestion = cursor >= totalQuestions - 1;
  const section = lesson.sections.find((s) => s.id === currentQuestion?.sectionId);
  const lockedDifficulty = challenge.difficulty ?? "normal";

  return (
    <>
      <StorageFallbackBanner status={storageStatus} />
      <main className="app-shell quiz">
        <header className="quiz-header">
          {onExit && (
            <button type="button" className="ghost-button" onClick={onExit}>
              <span aria-hidden="true">&larr;</span> Dashboard
            </button>
          )}
          <div className="quiz-heading">
            <p className="eyebrow">{formatDisplayDate(dateKey)}</p>
            <h1 className="quiz-title">Daily Challenge</h1>
            <p className="quiz-subtitle">
              {lesson.title} &middot;{" "}
              <span className={`chip chip--${lockedDifficulty}`}>
                {DIFFICULTY_LABELS[lockedDifficulty]}
              </span>
            </p>
          </div>
          <ScoreBadge challenge={challenge} attempts={attempts} />
        </header>

        {lockedDifficulty !== difficulty && (
          <p className="notice" role="note">
            You already started today&apos;s challenge on {DIFFICULTY_LABELS[lockedDifficulty]}, so
            it stays that way until tomorrow. {DIFFICULTY_LABELS[difficulty]} applies to Test
            Yourself right now.
          </p>
        )}

        {showResults && allAnswered ? (
          <DailyResults
            challenge={challenge}
            attempts={attempts}
            onExit={onExit}
            onStartExam={onStartExam}
            onReview={() => {
              setShowResults(false);
              setCursor(0);
            }}
          />
        ) : (
          currentQuestion && (
            <>
              <ProgressBar current={cursor + 1} total={totalQuestions} />
              <div className="quiz-layout">
                <QuestionCard
                  key={currentQuestion.id}
                  question={currentQuestion}
                  priorAttempt={currentAttempt}
                  dateKey={dateKey}
                  onAnswered={handleAnswered}
                  onNext={
                    isLastQuestion
                      ? allAnswered
                        ? () => setShowResults(true)
                        : undefined
                      : () => setCursor((c) => Math.min(c + 1, totalQuestions - 1))
                  }
                  nextLabel={isLastQuestion ? "See results" : "Next Question"}
                />
                <InsightCard
                  section={section}
                  difficulty={lockedDifficulty}
                  answered={Boolean(currentAttempt)}
                  index={cursor}
                />
              </div>
            </>
          )
        )}
      </main>
    </>
  );
}

interface DailyResultsProps {
  challenge: DailyChallenge;
  attempts: Attempt[];
  onExit?: () => void;
  onStartExam?: () => void;
  onReview: () => void;
}

function DailyResults({ challenge, attempts, onExit, onStartExam, onReview }: DailyResultsProps) {
  const score = calculateScore(challenge, attempts);
  const correct = Math.round((score / 100) * challenge.questions.length);
  return (
    <section className="results-card" data-testid="milestone-card">
      <p className="results-score">{score}%</p>
      <p className="results-title">Today&apos;s challenge is complete!</p>
      <p className="results-text">
        {correct} of {challenge.questions.length} right on your first try. Come back tomorrow for a
        new set, or test yourself on the whole lesson now.
      </p>
      <div className="button-row">
        {onStartExam && (
          <button type="button" className="primary-button" onClick={onStartExam}>
            Test yourself
          </button>
        )}
        <button type="button" className="secondary-button" onClick={onReview}>
          Review answers
        </button>
        {onExit && (
          <button type="button" className="ghost-button" onClick={onExit}>
            Back to dashboard
          </button>
        )}
      </div>
    </section>
  );
}

function formatDisplayDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}
