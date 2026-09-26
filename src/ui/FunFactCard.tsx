// FunFactCard: a "Did You Know?" / "A Little History" card showing real,
// cited trivia for a lesson topic. Facts come from src/data/funFacts.ts, a
// static bundle researched with the fetch MCP server at authoring time (see
// NOTES.md, Lesson 6) -- never fetched over the network at runtime.

import type { FunFact } from "../data/funFacts";

export interface FunFactCardProps {
  fact: FunFact;
  /** Topic name shown under the label, when the card sits outside its section. */
  topic?: string;
  compact?: boolean;
}

export function FunFactCard({ fact, topic, compact = false }: FunFactCardProps) {
  const label = fact.kind === "history" ? "A Little History" : "Did You Know?";
  return (
    <aside
      className={`insight insight--fact insight--${fact.kind}${compact ? " insight--compact" : ""}`}
      aria-label={label}
      data-testid="fun-fact-card"
    >
      <p className="insight-eyebrow">
        <span aria-hidden="true">{fact.kind === "history" ? "\u231B" : "\u2728"}</span> {label}
      </p>
      {topic && <p className="insight-topic">{topic}</p>}
      <p className="insight-text">{fact.text}</p>
      <p className="insight-source">
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
