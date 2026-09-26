// ScoreBadge: displays "Not assessed yet" before any Attempt is recorded for
// the day, otherwise the live numeric score.
// See design.md: "UI: ScoreBadge". Requirements: 8.2, 8.3.

import { calculateScore } from "../domain/scoring";
import type { Attempt, DailyChallenge } from "../domain/types";

export interface ScoreBadgeProps {
  challenge: DailyChallenge;
  /** Attempts already scoped to the challenge's dateKey by the caller. */
  attempts: readonly Attempt[];
}

/** Purely presentational color tier -- has no bearing on the Score value itself. */
function scoreColorTier(score: number): "low" | "mid" | "high" {
  if (score < 50) return "low";
  if (score < 80) return "mid";
  return "high";
}

export function ScoreBadge({ challenge, attempts }: ScoreBadgeProps) {
  if (attempts.length === 0) {
    // Requirement 8.2: no Attempts yet for today -> literal "Not assessed yet".
    return (
      <p className="score-badge" data-testid="score-badge">
        Score: <strong>Not assessed yet</strong>
      </p>
    );
  }

  // Requirement 8.3: recomputed from the pure Scoring_Engine on every render,
  // so it always reflects the latest attempts passed in.
  const score = calculateScore(challenge, attempts);
  const tier = scoreColorTier(score);

  return (
    <p className={`score-badge score-badge--${tier}`} data-testid="score-badge">
      Score: <strong>{score}%</strong>
    </p>
  );
}
