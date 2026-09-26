// ExamView: "Test Yourself" -- an on-demand exam over the WHOLE lesson,
// available any time from the dashboard. Built by buildExam (every topic
// covered, each point asked at most once, up to 20 questions) at the chosen
// difficulty. Answers are graded with the same pure grading path as the
// Daily Challenge but kept separate from the daily Score (Requirements 6-8
// are scoped to the Daily_Challenge). The finished result, with a per-topic
// breakdown, is saved so the dashboard and calendar can show it.
// Requirement 12.

import { useMemo, useState } from "react";
import { buildExam, formatLocalDate } from "../domain/challenge";
import type { Attempt, Difficulty, ExamResult, Lesson } from "../domain/types";
import type { StorageLayer } from "../storage/db";
import { ProgressBar } from "./ProgressBar";
import { QuestionCard } from "./QuestionCard";
import { InsightCard } from "./InsightCard";

export interface ExamViewProps {
  lesson: Lesson;
  onExit: () => void;
  difficulty?: Difficulty;
  /** Where to save the finished result. Omit to keep the run in memory only. */
  storage?: StorageLayer;
  /** Called with the saved result once the learner finishes. */
  onFinished?: (result: ExamResult) => void;
  /** Fixed seed for deterministic tests; defaults to a fresh one per run. */
  seed?: string;
  now?: () => Date;
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

export function ExamView({
  lesson,
  onExit,
  difficulty = "normal",
  storage,
  onFinished,
  seed,
  now = () => new Date(),
}: ExamViewProps) {
  // A new seed per run (unless fixed) so every retake shuffles differently.
  const [runSeed, setRunSeed] = useState(() => seed ?? `${formatLocalDate(now())}:${now().getTime()}`);
  const exam = useMemo(() => buildExam(lesson, runSeed, difficulty), [lesson, runSeed, difficulty]);

  const [cursor, setCursor] = useState(0);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [result, setResult] = useState<ExamResult | undefined>(undefined);

  const total = exam.questions.length;
  const currentQuestion = exam.questions[cursor];
  const currentAttempt = currentQuestion
    ? attempts.find((a) => a.questionId === currentQuestion.id)
    : undefined;

  function finish(finalAttempts: Attempt[]) {
    const bySection = lesson.sections
      .map((section) => {
        const questions = exam.questions.filter((q) => q.sectionId === section.id);
        const correct = questions.filter((q) =>
          finalAttempts.some((a) => a.questionId === q.id && a.isCorrect),
        ).length;
        return { sectionId: section.id, correct, total: questions.length };
      })
      .filter((row) => row.total > 0);
    const finishedAt = now().getTime();
    const examResult: ExamResult = {
      id: `${lesson.id}:${runSeed}`,
      lessonId: lesson.id,
      dateKey: formatLocalDate(now()),
      difficulty,
      correct: finalAttempts.filter((a) => a.isCorrect).length,
      total,
      bySection,
      finishedAt,
    };
    setResult(examResult);
    void storage?.putExamResult(examResult);
    onFinished?.(examResult);
  }

  function retake() {
    setRunSeed(`${formatLocalDate(now())}:${now().getTime()}:${Math.floor(performance.now())}`);
    setAttempts([]);
    setCursor(0);
    setResult(undefined);
  }

  if (total === 0) {
    return (
      <main className="app-shell quiz">
        <p className="empty-state">This lesson doesn&apos;t have enough content for an exam yet.</p>
        <button type="button" className="secondary-button" onClick={onExit}>
          Back to dashboard
        </button>
      </main>
    );
  }

  if (result) {
    return <ExamResults lesson={lesson} result={result} onExit={onExit} onRetake={retake} />;
  }

  const section = lesson.sections.find((s) => s.id === currentQuestion?.sectionId);
  const isLast = cursor + 1 >= total;

  return (
    <main className="app-shell quiz">
      <header className="quiz-header">
        <button type="button" className="ghost-button" onClick={onExit}>
          <span aria-hidden="true">&larr;</span> Quit exam
        </button>
        <div className="quiz-heading">
          <p className="eyebrow">Test yourself</p>
          <h1 className="quiz-title">{lesson.title}</h1>
          <p className="quiz-subtitle">
            Every topic, {total} questions &middot;{" "}
            <span className={`chip chip--${difficulty}`}>{DIFFICULTY_LABELS[difficulty]}</span>
          </p>
        </div>
      </header>

      <ProgressBar current={cursor + 1} total={total} />

      {currentQuestion && (
        <div className="quiz-layout">
          <QuestionCard
            key={currentQuestion.id}
            question={currentQuestion}
            priorAttempt={currentAttempt}
            dateKey={exam.dateKey}
            onAnswered={(attempt) => setAttempts((prev) => [...prev, attempt])}
            onNext={() => (isLast ? finish(attempts) : setCursor((c) => c + 1))}
            nextLabel={isLast ? "See results" : "Next Question"}
          />
          <InsightCard
            section={section}
            difficulty={difficulty}
            answered={Boolean(currentAttempt)}
            index={cursor}
          />
        </div>
      )}
    </main>
  );
}

interface ExamResultsProps {
  lesson: Lesson;
  result: ExamResult;
  onExit: () => void;
  onRetake: () => void;
}

function ExamResults({ lesson, result, onExit, onRetake }: ExamResultsProps) {
  const percent = result.total > 0 ? Math.round((result.correct / result.total) * 100) : 0;
  const rows = result.bySection.map((row) => ({
    ...row,
    title: lesson.sections.find((s) => s.id === row.sectionId)?.title ?? "Topic",
    percent: row.total > 0 ? Math.round((row.correct / row.total) * 100) : 0,
  }));
  const review = rows.filter((row) => row.percent < 70);

  return (
    <main className="app-shell quiz">
      <section className="results-card" data-testid="exam-summary">
        <p className="eyebrow">Test yourself &middot; results</p>
        <p className="results-score">{percent}%</p>
        <p className="results-title">{verdict(percent)}</p>
        <p className="results-text">
          {result.correct} of {result.total} correct across every topic
        </p>

        <ul className="topic-bars" aria-label="Score by topic">
          {rows.map((row) => (
            <li key={row.sectionId} className="topic-bar">
              <span className="topic-bar-label">{row.title}</span>
              <span className="topic-bar-track" aria-hidden="true">
                <span
                  className={`topic-bar-fill topic-bar-fill--${tier(row.percent)}`}
                  style={{ width: `${Math.max(row.percent, 4)}%` }}
                />
              </span>
              <span className="topic-bar-value">
                {row.correct}/{row.total}
              </span>
            </li>
          ))}
        </ul>

        {review.length > 0 ? (
          <p className="results-text">
            Worth another look: <strong>{review.map((r) => r.title).join(", ")}</strong>
          </p>
        ) : (
          <p className="results-text">Every topic at 70% or better. You know this one.</p>
        )}

        <div className="button-row">
          <button type="button" className="primary-button" onClick={onRetake}>
            Retake with new questions
          </button>
          <button type="button" className="ghost-button" onClick={onExit}>
            Back to dashboard
          </button>
        </div>
      </section>
    </main>
  );
}

function verdict(percent: number): string {
  if (percent >= 90) return "You've got this lesson down.";
  if (percent >= 70) return "Solid. A couple of gaps to close.";
  if (percent >= 50) return "Getting there. Review the weak topics.";
  return "Early days. Study the topics below and try again.";
}

function tier(percent: number): "low" | "mid" | "high" {
  if (percent < 50) return "low";
  if (percent < 80) return "mid";
  return "high";
}
