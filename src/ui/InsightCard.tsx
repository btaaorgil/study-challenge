// InsightCard: the quiz side panel. Shows cited "Did You Know?" / "A Little
// History" facts when the topic has them (the bundled sample lesson, facts
// researched with the fetch MCP server -- see NOTES.md, Lesson 6), and
// otherwise the topic's key terms plus a short recap from the learner's own
// notes. Never invents facts for uploaded lessons.
//
// Whether it's visible before answering depends on difficulty: Easy shows
// it up front as a hint; Normal/Hard keep it locked until you've answered.

import type { Difficulty, LessonSection } from "../domain/types";
import { getFunFactsForSection } from "../data/funFacts";
import { keyTermsForSection, sectionExcerpt } from "../domain/insights";
import { FunFactCard } from "./FunFactCard";

export interface InsightCardProps {
  section: LessonSection | undefined;
  difficulty: Difficulty;
  answered: boolean;
  /** Rotates between a topic's facts so consecutive questions don't repeat one. */
  index: number;
}

export function InsightCard({ section, difficulty, answered, index }: InsightCardProps) {
  if (!section) return null;
  const revealed = answered || difficulty === "easy";

  if (!revealed) {
    return (
      <aside className="insight insight--locked" aria-label="Topic insight" data-testid="insight-locked">
        <p className="insight-eyebrow">Topic insight</p>
        <p className="insight-locked-text">
          Answer to unlock a fact about this topic.
          {difficulty === "hard" ? " No hints on Hard." : ""}
        </p>
      </aside>
    );
  }

  const facts = getFunFactsForSection(section.id);
  if (facts.length > 0) {
    const fact = facts[index % facts.length];
    return <FunFactCard fact={fact} topic={section.title} />;
  }

  const terms = keyTermsForSection(section, 5);
  return (
    <aside className="insight" aria-label="Topic recap" data-testid="insight-recap">
      <p className="insight-eyebrow">From your notes</p>
      <p className="insight-topic">{section.title}</p>
      {terms.length > 0 && (
        <ul className="term-chips" aria-label="Key terms">
          {terms.map((term) => (
            <li key={term} className="term-chip">
              {term}
            </li>
          ))}
        </ul>
      )}
      {answered && <p className="insight-text">{sectionExcerpt(section, 220)}</p>}
    </aside>
  );
}
