// LessonDashboard: home screen once a lesson exists. Shows the lesson's
// topics (one card per section the importer found, with cited facts or key
// terms), the difficulty picker, the two ways to practice -- today's Daily
// Challenge and an any-time "Test Yourself" exam -- and the study calendar.

import { useEffect, useState } from "react";
import type { DailyChallenge, Difficulty, ExamResult, Lesson } from "../domain/types";
import type { StorageLayer } from "../storage/db";
import { calculateScore } from "../domain/scoring";
import { formatLocalDate } from "../domain/challenge";
import { keyTermsForSection, sectionExcerpt } from "../domain/insights";
import { getFunFactsForSection } from "../data/funFacts";
import { DifficultySelector } from "./DifficultySelector";
import { FunFactCard } from "./FunFactCard";
import { StudyCalendarView } from "./StudyCalendarView";

export interface LessonDashboardProps {
  lesson: Lesson;
  storage: StorageLayer;
  difficulty: Difficulty;
  onDifficultyChange: (difficulty: Difficulty) => void;
  onStartDaily: () => void;
  onStartExam: () => void;
  refreshKey?: number;
  now?: () => Date;
}

interface DailyStatus {
  answered: number;
  total: number;
  score?: number;
}

export function LessonDashboard({
  lesson,
  storage,
  difficulty,
  onDifficultyChange,
  onStartDaily,
  onStartExam,
  refreshKey = 0,
  now = () => new Date(),
}: LessonDashboardProps) {
  const [daily, setDaily] = useState<DailyStatus | undefined>(undefined);
  const [exams, setExams] = useState<ExamResult[]>([]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const dateKey = formatLocalDate(now());
      const challenge: DailyChallenge | undefined = await storage.getDailyChallenge(dateKey);
      let status: DailyStatus = { answered: 0, total: 5 };
      if (challenge && challenge.lessonId === lesson.id) {
        const ids = new Set(challenge.questions.map((q) => q.id));
        const attempts = (await storage.getAttempts(dateKey)).filter((a) => ids.has(a.questionId));
        status = {
          answered: new Set(attempts.map((a) => a.questionId)).size,
          total: challenge.questions.length,
          score: attempts.length > 0 ? calculateScore(challenge, attempts) : undefined,
        };
      }
      const results = (await storage.listExamResults()).filter((r) => r.lessonId === lesson.id);
      if (!cancelled) {
        setDaily(status);
        setExams(results);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // `now` is a clock, not data; re-running on every render would loop.
  }, [storage, lesson.id, refreshKey]);

  const conceptCount = lesson.sections.reduce((sum, s) => sum + s.concepts.length, 0);
  const lastExam = exams[exams.length - 1];
  const bestExam = exams.reduce<number | undefined>((best, r) => {
    const pct = r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0;
    return best === undefined || pct > best ? pct : best;
  }, undefined);

  return (
    <main className="app-shell dashboard">
      <section className="hero" aria-labelledby="lesson-title">
        <p className="eyebrow">Your lesson</p>
        <h1 id="lesson-title" className="hero-title">
          {lesson.title}
        </h1>
        <p className="hero-meta">
          {lesson.sections.length} {lesson.sections.length === 1 ? "topic" : "topics"} &middot;{" "}
          {conceptCount} key points
        </p>
        <DifficultySelector value={difficulty} onChange={onDifficultyChange} />
      </section>

      <div className="action-grid">
        <button type="button" className="action-card action-card--daily" onClick={onStartDaily}>
          <span className="action-kicker">Daily Challenge</span>
          <span className="action-title">{dailyTitle(daily)}</span>
          <span className="action-meta">{dailyMeta(daily)}</span>
          <span className="action-cta" aria-hidden="true">
            {daily && daily.answered >= daily.total ? "Review" : daily?.answered ? "Continue" : "Start"} &rarr;
          </span>
        </button>

        <button type="button" className="action-card action-card--exam" onClick={onStartExam}>
          <span className="action-kicker">Test Yourself</span>
          <span className="action-title">Exam on every topic</span>
          <span className="action-meta">
            {lastExam
              ? `Last: ${Math.round((lastExam.correct / Math.max(lastExam.total, 1)) * 100)}% \u00b7 Best: ${bestExam}%`
              : "Feeling confident? See how well you really know it."}
          </span>
          <span className="action-cta" aria-hidden="true">
            Take exam &rarr;
          </span>
        </button>
      </div>

      <div className="dashboard-columns">
        <section className="topics" aria-labelledby="topics-heading">
          <h2 id="topics-heading" className="section-heading">
            Topics in this lesson
          </h2>
          <ol className="topic-grid">
            {lesson.sections.map((section, index) => {
              const facts = getFunFactsForSection(section.id);
              const history = facts.find((f) => f.kind === "history") ?? facts[0];
              const terms = keyTermsForSection(section, 4);
              const lastScore = lastExam?.bySection.find((r) => r.sectionId === section.id);
              return (
                <li key={section.id} className="topic-card">
                  <div className="topic-card-head">
                    <span className="topic-index" aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="topic-title">{section.title}</h3>
                    {lastScore && (
                      <span className="topic-score" title="Last exam on this topic">
                        {lastScore.correct}/{lastScore.total}
                      </span>
                    )}
                  </div>
                  <p className="topic-excerpt">{sectionExcerpt(section)}</p>
                  {terms.length > 0 && (
                    <ul className="term-chips" aria-label={`Key terms in ${section.title}`}>
                      {terms.map((term) => (
                        <li key={term} className="term-chip">
                          {term}
                        </li>
                      ))}
                    </ul>
                  )}
                  {history && <FunFactCard fact={history} compact />}
                </li>
              );
            })}
          </ol>
        </section>

        <aside className="dashboard-side">
          <StudyCalendarView storage={storage} now={now} refreshKey={refreshKey} />
        </aside>
      </div>
    </main>
  );
}

function dailyTitle(status: DailyStatus | undefined): string {
  if (!status || status.answered === 0) return "5 questions for today";
  if (status.answered >= status.total) return `Done today \u00b7 ${status.score ?? 0}%`;
  return `${status.answered} of ${status.total} answered`;
}

function dailyMeta(status: DailyStatus | undefined): string {
  if (!status || status.answered === 0) return "A quick daily set drawn from your topics.";
  if (status.answered >= status.total) return "Nice. A fresh set unlocks tomorrow.";
  return `Score so far: ${status.score ?? 0}%. Pick up where you left off.`;
}
