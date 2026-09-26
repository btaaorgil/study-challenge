// ChallengeView: the top-level Daily Study Challenge screen. On mount,
// resolves dateKey, loads/creates the day's DailyChallenge and its Attempts
// via the domain+storage layers, holds them in React state, and re-renders
// on every submitAnswer. Presents questions one at a time with a progress
// bar, a difficulty/pacing selector, and a "Did You Know?" fact card per
// section. Once the day's 5 questions are all answered, offers to start the
// multi-section Final Exam (Exam Mode).
// See design.md: "UI: Challenge_View" (mermaid tree), "Error Handling table".
// Requirements: 3.1, 3.5, 9.5.

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatLocalDate, getOrCreateDailyChallenge } from "../domain/challenge";
import type { Attempt, DailyChallenge, Lesson, LessonSection } from "../domain/types";
import type { StorageLayer, StorageStatus } from "../storage/db";
import { getFunFactsForSection } from "../data/funFacts";
import { QuestionCard } from "./QuestionCard";
import { ScoreBadge } from "./ScoreBadge";
import { StorageFallbackBanner } from "./StorageFallbackBanner";
import { ProgressBar } from "./ProgressBar";
import { DifficultySelector, type Difficulty } from "./DifficultySelector";
import { FunFactCard } from "./FunFactCard";
import { ExamView } from "./ExamView";

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
  const [cursor, setCursor] = useState(0); // index of the question currently on screen
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [examMode, setExamMode] = useState(false);

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

  const sectionPills = useMemo(
    () => (state ? getSectionPills(state.challenge, lesson) : []),
    [state, lesson],
  );

  if (examMode) {
    return (
      <ExamView
        lesson={lesson}
        onExit={() => setExamMode(false)}
        now={now}
      />
    );
  }

  if (!state) {
    return (
      <div className="page">
        <main className="app-shell">
          <p className="loading-state" role="status">
            Loading today&apos;s challenge&hellip;
          </p>
        </main>
      </div>
    );
  }

  const { challenge, attempts, dateKey } = state;
  const attemptByQuestionId = new Map(attempts.map((a) => [a.questionId, a]));
  const totalQuestions = challenge.questions.length;
  const allAnswered = attempts.length >= totalQuestions;
  const currentQuestion = challenge.questions[Math.min(cursor, totalQuestions - 1)];
  const currentAttempt = currentQuestion ? attemptByQuestionId.get(currentQuestion.id) : undefined;
  const isLastQuestion = cursor >= totalQuestions - 1;
  const funFacts = currentQuestion ? getFunFactsForSection(currentQuestion.sectionId) : [];
  const fact = funFacts[0];

  return (
    <div className="page">
      <StorageFallbackBanner status={storageStatus} />
      <main className="app-shell">
        <header className="app-header">
          <h1 className="app-title">Astra</h1>
          <p className="app-subtitle">{formatDisplayDate(dateKey)}</p>
          {sectionPills.length > 0 && (
            <ul className="section-pills" aria-label="Lesson sections covered today">
              {sectionPills.map(({ sectionId, label }) => (
                <li key={sectionId} className="section-pill">
                  {label}
                </li>
              ))}
            </ul>
          )}
        </header>

        <ScoreBadge challenge={challenge} attempts={attempts} />

        <DifficultySelector value={difficulty} onChange={setDifficulty} />

        {!allAnswered && currentQuestion && (
          <>
            <ProgressBar current={cursor + 1} total={totalQuestions} />

            {difficulty === "easy" && !currentAttempt && fact && <FunFactCard fact={fact} />}

            <QuestionCard
              key={currentQuestion.id}
              question={currentQuestion}
              priorAttempt={currentAttempt}
              dateKey={dateKey}
              onAnswered={handleAnswered}
              onNext={
                !isLastQuestion ? () => setCursor((c) => Math.min(c + 1, totalQuestions - 1)) : undefined
              }
            />

            {difficulty === "normal" && currentAttempt && fact && <FunFactCard fact={fact} />}
          </>
        )}

        {allAnswered && (
          <section className="milestone-card" data-testid="milestone-card">
            <p className="milestone-title">Today&apos;s challenge is complete!</p>
            <p className="milestone-text">
              You&apos;ve answered all {totalQuestions} questions. Ready to test everything
              you&apos;ve learned across every section?
            </p>
            <button type="button" className="primary-button" onClick={() => setExamMode(true)}>
              I&apos;m ready for the Final Exam
            </button>
          </section>
        )}
      </main>
    </div>
  );
}

/**
 * Short, scannable pill labels for known sample-lesson sections (Req: header
 * shows section pills like "HTTP, DOM, Git, Big-O" rather than full titles).
 * Purely presentational -- falls back to a section's first word for any
 * lesson/section this map doesn't recognize, so custom lessons (Req 2.3)
 * still render a reasonable pill instead of breaking.
 */
const SECTION_SHORT_LABELS: Record<string, string> = {
  "sample-section-http": "HTTP",
  "sample-section-dom": "DOM",
  "sample-section-git": "Git",
  "sample-section-bigo": "Big-O",
};

function toShortLabel(section: LessonSection): string {
  return SECTION_SHORT_LABELS[section.id] ?? section.title.split(" ")[0];
}

interface SectionPill {
  sectionId: string;
  label: string;
}

/** The distinct Lesson_Sections today's questions were drawn from, in lesson order, as pill data. */
function getSectionPills(challenge: DailyChallenge, lesson: Lesson): SectionPill[] {
  const sectionIdsUsedToday = new Set(challenge.questions.map((q) => q.sectionId));
  return lesson.sections
    .filter((section) => sectionIdsUsedToday.has(section.id))
    .map((section) => ({ sectionId: section.id, label: toShortLabel(section) }));
}

/** Formats a "YYYY-MM-DD" dateKey as a friendly local date, e.g. "Monday, January 15". */
function formatDisplayDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
