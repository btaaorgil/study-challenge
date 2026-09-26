// StudyCalendarView: the "Study Calendar & Milestones" tab. Lists every
// persisted Daily_Challenge (chronologically), each day's score (if
// assessed) via the pure Scoring_Engine, and flags perfect-score days as a
// milestone. Pacing/difficulty and exams are surfaced elsewhere (the Daily
// Challenge tab); this view is a read-only history/progress surface.

import { useEffect, useState } from "react";
import type { StorageLayer } from "../storage/db";
import type { Attempt, DailyChallenge } from "../domain/types";
import { calculateScore } from "../domain/scoring";

export interface StudyCalendarViewProps {
  storage: StorageLayer;
}

interface DayRecord {
  challenge: DailyChallenge;
  attempts: Attempt[];
}

export function StudyCalendarView({ storage }: StudyCalendarViewProps) {
  const [days, setDays] = useState<DayRecord[] | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const challenges = await storage.listDailyChallenges();
      // Real, non-exam Daily_Challenge dateKeys are "YYYY-MM-DD"; the Final
      // Exam builds a separate, non-persisted challenge shape (dateKey
      // prefixed "exam:"), which never reaches this list since Exam Mode
      // results aren't persisted to storage -- filtered here defensively.
      const realChallenges = challenges.filter((c) => !c.dateKey.startsWith("exam:"));
      const withAttempts = await Promise.all(
        realChallenges.map(async (challenge) => ({
          challenge,
          attempts: await storage.getAttempts(challenge.dateKey),
        })),
      );
      withAttempts.sort((a, b) => (a.challenge.dateKey < b.challenge.dateKey ? 1 : -1));
      if (!cancelled) {
        setDays(withAttempts);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [storage]);

  return (
    <div className="page">
      <main className="app-shell">
        <header className="app-header">
          <h1 className="app-title">Study Calendar</h1>
          <p className="app-subtitle">Your pacing, difficulty, and milestones over time</p>
        </header>

        {!days && (
          <p className="loading-state" role="status">
            Loading your history&hellip;
          </p>
        )}

        {days && days.length === 0 && (
          <p className="empty-state">
            No challenges completed yet. Answer today&apos;s Daily Challenge to start your
            streak.
          </p>
        )}

        {days && days.length > 0 && (
          <ul className="calendar-list" aria-label="Study history">
            {days
              .map((day) => {
                const assessed = day.attempts.length > 0;
                const score = assessed ? calculateScore(day.challenge, day.attempts) : undefined;
                const isMilestone = score === 100;
                return (
                  <li key={day.challenge.dateKey} className="calendar-entry">
                    <div>
                      <p className="calendar-date">{formatDisplayDate(day.challenge.dateKey)}</p>
                      <p className="calendar-meta">
                        {assessed
                          ? `${day.attempts.length} of ${day.challenge.questions.length} answered`
                          : "Not started"}
                      </p>
                    </div>
                    <div className="calendar-entry-right">
                      <span className="calendar-meta">{assessed ? `${score}%` : "\u2014"}</span>
                      {isMilestone && <span className="milestone-badge">Perfect score</span>}
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </main>
    </div>
  );
}

function formatDisplayDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
