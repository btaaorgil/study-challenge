// StudyCalendarView: a month grid of study activity. Each day is tinted by
// that day's Daily Challenge score (via the pure Scoring_Engine), marked
// when a Test Yourself exam was taken, and summarized with a current streak
// and best score. Read-only; lives on the lesson dashboard.

import { useEffect, useMemo, useState } from "react";
import type { StorageLayer } from "../storage/db";
import type { ExamResult } from "../domain/types";
import { calculateScore } from "../domain/scoring";
import { formatLocalDate } from "../domain/challenge";

export interface StudyCalendarViewProps {
  storage: StorageLayer;
  now?: () => Date;
  /** Bump to force a reload (e.g. after finishing a quiz). */
  refreshKey?: number;
}

interface DayInfo {
  score?: number; // undefined = challenge generated but nothing answered
  answered: number;
  total: number;
  exams: number;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function StudyCalendarView({ storage, now = () => new Date(), refreshKey = 0 }: StudyCalendarViewProps) {
  const today = formatLocalDate(now());
  const [days, setDays] = useState<Map<string, DayInfo> | undefined>(undefined);
  const [month, setMonth] = useState(() => {
    const d = now();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [challenges, exams] = await Promise.all([
        storage.listDailyChallenges(),
        storage.listExamResults(),
      ]);
      const map = new Map<string, DayInfo>();
      for (const challenge of challenges) {
        if (challenge.dateKey.startsWith("exam:")) continue;
        const attempts = await storage.getAttempts(challenge.dateKey);
        const ids = new Set(challenge.questions.map((q) => q.id));
        const relevant = attempts.filter((a) => ids.has(a.questionId));
        map.set(challenge.dateKey, {
          score: relevant.length > 0 ? calculateScore(challenge, relevant) : undefined,
          answered: new Set(relevant.map((a) => a.questionId)).size,
          total: challenge.questions.length,
          exams: 0,
        });
      }
      for (const exam of exams as ExamResult[]) {
        const info = map.get(exam.dateKey) ?? { answered: 0, total: 0, exams: 0 };
        map.set(exam.dateKey, { ...info, exams: info.exams + 1 });
      }
      if (!cancelled) setDays(map);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [storage, refreshKey]);

  const stats = useMemo(() => (days ? summarize(days, today) : undefined), [days, today]);
  const cells = useMemo(() => monthCells(month.year, month.month), [month]);
  const monthLabel = new Date(month.year, month.month, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  function shiftMonth(delta: number) {
    setMonth(({ year, month: m }) => {
      const d = new Date(year, m + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <section className="panel calendar" aria-labelledby="calendar-heading">
      <div className="panel-head">
        <h2 id="calendar-heading" className="panel-title">
          Study calendar
        </h2>
        <div className="calendar-nav">
          <button type="button" className="icon-button" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            &lsaquo;
          </button>
          <span className="calendar-month" aria-live="polite">
            {monthLabel}
          </span>
          <button type="button" className="icon-button" onClick={() => shiftMonth(1)} aria-label="Next month">
            &rsaquo;
          </button>
        </div>
      </div>

      {stats && (
        <dl className="calendar-stats">
          <div>
            <dt>Streak</dt>
            <dd>
              {stats.streak} {stats.streak === 1 ? "day" : "days"}
            </dd>
          </div>
          <div>
            <dt>Days studied</dt>
            <dd>{stats.studied}</dd>
          </div>
          <div>
            <dt>Best score</dt>
            <dd>{stats.best === undefined ? "\u2014" : `${stats.best}%`}</dd>
          </div>
        </dl>
      )}

      {!days ? (
        <p className="loading-state" role="status">
          Loading your history&hellip;
        </p>
      ) : (
        <table className="calendar-grid" aria-label={`Study activity for ${monthLabel}`}>
          <thead>
            <tr>
              {WEEKDAYS.map((d) => (
                <th key={d} scope="col" abbr={d}>
                  {d.charAt(0)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chunk(cells, 7).map((week, w) => (
              <tr key={w}>
                {week.map((dateKey, i) => {
                  if (!dateKey) return <td key={i} className="calendar-cell calendar-cell--empty" />;
                  const info = days.get(dateKey);
                  const tier = info?.score === undefined ? (info?.exams ? "exam" : "none") : scoreTier(info.score);
                  return (
                    <td
                      key={dateKey}
                      className={`calendar-cell calendar-cell--${tier}${dateKey === today ? " calendar-cell--today" : ""}`}
                      aria-label={describeDay(dateKey, info)}
                      title={describeDay(dateKey, info)}
                      data-testid={`calendar-day-${dateKey}`}
                    >
                      <span aria-hidden="true">{Number(dateKey.slice(8))}</span>
                      {info?.exams ? <span className="calendar-dot" aria-hidden="true" /> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ul className="calendar-legend" aria-hidden="true">
        <li><span className="swatch swatch--low" /> &lt;50%</li>
        <li><span className="swatch swatch--mid" /> 50-79%</li>
        <li><span className="swatch swatch--high" /> 80%+</li>
        <li><span className="calendar-dot" /> exam</li>
      </ul>

      {days && days.size === 0 && (
        <p className="empty-state">Nothing here yet. Finish today&apos;s challenge to start your streak.</p>
      )}
    </section>
  );
}

function scoreTier(score: number): "low" | "mid" | "high" {
  if (score < 50) return "low";
  if (score < 80) return "mid";
  return "high";
}

function describeDay(dateKey: string, info: DayInfo | undefined): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (!info) return `${label}: no activity`;
  const parts: string[] = [];
  if (info.score !== undefined) parts.push(`${info.score}% (${info.answered} of ${info.total} answered)`);
  else if (info.total > 0) parts.push("challenge not started");
  if (info.exams > 0) parts.push(`${info.exams} ${info.exams === 1 ? "exam" : "exams"} taken`);
  return `${label}: ${parts.join(", ")}`;
}

/** dateKeys for a Monday-first month grid, with undefined padding. */
function monthCells(year: number, month: number): Array<string | undefined> {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<string | undefined> = Array.from({ length: lead }, () => undefined);
  for (let d = 1; d <= daysInMonth; d++) cells.push(formatLocalDate(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(undefined);
  return cells;
}

function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/** Streak = consecutive days ending today (or yesterday) with at least one answer or exam. */
function summarize(days: Map<string, DayInfo>, today: string) {
  const active = (key: string) => {
    const info = days.get(key);
    return Boolean(info && (info.answered > 0 || info.exams > 0));
  };
  const [y, m, d] = today.split("-").map(Number);
  const cursor = new Date(y, m - 1, d);
  if (!active(today)) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (active(formatLocalDate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const studied = [...days.keys()].filter(active).length;
  const scores = [...days.values()].map((i) => i.score).filter((s): s is number => s !== undefined);
  return { streak, studied, best: scores.length > 0 ? Math.max(...scores) : undefined };
}
