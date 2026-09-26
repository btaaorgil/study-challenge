// Small read-only summaries of a lesson section for the dashboard and the
// quiz side panel. Pure functions over the learner's own text.

import type { LessonSection } from "./types";
import { extractTerms } from "./text";

/**
 * The section's most quiz-worthy terms, best first: terms that recur across
 * the section's sentences rank above one-off words.
 */
export function keyTermsForSection(section: LessonSection, count: number = 4): string[] {
  const scores = new Map<string, { display: string; score: number }>();
  for (const concept of section.concepts) {
    for (const term of extractTerms(concept.text)) {
      const key = term.text.toLowerCase();
      const display = term.kind === "word" ? key : term.text;
      const existing = scores.get(key);
      scores.set(key, {
        display: existing?.display ?? display,
        score: (existing?.score ?? 0) + term.weight + (existing ? 3 : 0),
      });
    }
  }
  return [...scores.values()]
    .sort((a, b) => b.score - a.score || a.display.localeCompare(b.display))
    .slice(0, count)
    .map(({ display }) => display);
}

/** A short preview of a section's text for cards. */
export function sectionExcerpt(section: LessonSection, maxLength: number = 160): string {
  const text = section.explanation.trim();
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd()}\u2026`;
}
