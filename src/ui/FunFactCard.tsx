// FunFactCard: a "Did You Know?" pop-out card showing real, cited trivia
// related to the current question's Lesson_Section. Facts are sourced from
// src/data/funFacts.ts, a static bundle authored using the MCP fetch tool at
// build/authoring time (see NOTES.md "## MCP (Lesson 6)") -- never fetched
// over the network at runtime, keeping the app's zero-network posture.

import type { FunFact } from "../data/funFacts";

export interface FunFactCardProps {
  fact: FunFact;
}

export function FunFactCard({ fact }: FunFactCardProps) {
  return (
    <aside className="fun-fact-card" aria-label="Did you know" data-testid="fun-fact-card">
      <p className="fun-fact-label">{fact.kind === "history" ? "A Little History" : "Did You Know?"}</p>
      <p className="fun-fact-text">{fact.text}</p>
      <p className="fun-fact-source">
        Source:{" "}
        {fact.sourceUrl ? (
          <a href={fact.sourceUrl} target="_blank" rel="noreferrer noopener">
            {fact.sourceLabel}
          </a>
        ) : (
          fact.sourceLabel
        )}
      </p>
    </aside>
  );
}
