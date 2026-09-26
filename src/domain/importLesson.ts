// Local, deterministic lesson importer ("Add Lesson" feature).
//
// Splits raw pasted text (notes/slides) into exactly 4 LessonSections with
// Concepts, using plain paragraph/sentence heuristics -- NOT an LLM and NOT
// a network call. This keeps the app's local-only, zero-network posture
// (.kiro/steering/storage.md, Requirement 10) intact: "sectioning" here
// means deterministic text splitting, not semantic understanding. Every
// Concept's `sourceQuote` is an exact, unmodified substring of the user's
// own pasted text -- nothing is fabricated or paraphrased into new claims.

import type { Concept, Lesson, LessonSection } from "./types";
import { validateLesson } from "./lesson";

const REQUIRED_SECTIONS = 4;
const TITLE_MAX_LENGTH = 100;
const EXPLANATION_MAX_LENGTH = 2000;
const CONCEPT_TEXT_MAX_LENGTH = 300;
const CONCEPTS_MAX_PER_SECTION = 20;
const MIN_SENTENCES_REQUIRED = REQUIRED_SECTIONS; // need at least 1 sentence/section

export type SectionizeResult =
  | { ok: true; lesson: Lesson }
  | { ok: false; error: string };

function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);
}

function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Splits `items` into `numChunks` near-equal, order-preserving groups. */
function chunkEvenly<T>(items: readonly T[], numChunks: number): T[][] {
  const chunks: T[][] = Array.from({ length: numChunks }, () => []);
  const base = Math.floor(items.length / numChunks);
  const remainder = items.length % numChunks;
  let index = 0;
  for (let i = 0; i < numChunks; i++) {
    const size = base + (i < remainder ? 1 : 0);
    for (let j = 0; j < size; j++) {
      chunks[i].push(items[index]);
      index++;
    }
  }
  return chunks;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trimEnd() + "\u2026";
}

function deriveShortTitle(sourceText: string, fallbackIndex: number): string {
  const words = sourceText.trim().split(/\s+/).slice(0, 6).join(" ");
  const title = words.length > 0 ? words : `Section ${fallbackIndex + 1}`;
  return truncate(title, TITLE_MAX_LENGTH);
}

function deriveLessonTitle(sentences: readonly string[]): string {
  const first = sentences[0];
  if (!first) return "Imported Lesson";
  const words = first.trim().split(/\s+/).slice(0, 8).join(" ");
  return truncate(words.length > 0 ? words : "Imported Lesson", TITLE_MAX_LENGTH);
}

function buildSection(bucket: readonly string[], index: number): LessonSection {
  // `bucket` items are either whole paragraphs (paragraph-mode) or already
  // individual sentences (sentence-mode); re-splitting into sentences here
  // is a no-op for the latter and the right granularity for the former.
  const sentences = bucket.flatMap(splitIntoSentences);
  const usable = sentences.length > 0 ? sentences : bucket;

  const concepts: Concept[] = usable.slice(0, CONCEPTS_MAX_PER_SECTION).map((sentence) => {
    const text = truncate(sentence, CONCEPT_TEXT_MAX_LENGTH);
    return {
      id: crypto.randomUUID(),
      text,
      // Framed with the user's own words, not a fabricated explanation --
      // we only have their pasted text to draw from.
      explanation: `From your notes: \u201c${text}\u201d`,
      sourceQuote: text, // exact substring of `text` by construction (Req 5.4)
    };
  });

  return {
    id: crypto.randomUUID(),
    title: deriveShortTitle(bucket[0] ?? `Section ${index + 1}`, index),
    explanation: truncate(bucket.join(" "), EXPLANATION_MAX_LENGTH),
    concepts,
  };
}

/**
 * Deterministically splits raw pasted text into a 4-section Lesson.
 * Returns an error (never throws) when there isn't enough content to fill
 * 4 sections with at least 1 concept each -- rather than fabricating filler
 * content to satisfy validateLesson's bounds.
 */
export function sectionizeText(rawText: string): SectionizeResult {
  const trimmedInput = rawText.trim();
  if (trimmedInput.length === 0) {
    return { ok: false, error: "Paste some lesson content before processing." };
  }

  const paragraphs = splitIntoParagraphs(trimmedInput);
  const allSentences = splitIntoSentences(trimmedInput);

  if (allSentences.length < MIN_SENTENCES_REQUIRED) {
    return {
      ok: false,
      error:
        `Not enough content to build ${REQUIRED_SECTIONS} sections. ` +
        `Add a bit more text (at least ${MIN_SENTENCES_REQUIRED} sentences).`,
    };
  }

  const units = paragraphs.length >= REQUIRED_SECTIONS ? paragraphs : allSentences;
  const buckets = chunkEvenly(units, REQUIRED_SECTIONS);

  if (buckets.some((bucket) => bucket.length === 0)) {
    return {
      ok: false,
      error: "Couldn't spread this content evenly into 4 sections. Try pasting a bit more text.",
    };
  }

  const sections = buckets.map((bucket, index) => buildSection(bucket, index));
  const lesson: Lesson = {
    id: crypto.randomUUID(),
    title: deriveLessonTitle(allSentences),
    sections,
  };

  const validation = validateLesson(lesson);
  if (!validation.valid) {
    return {
      ok: false,
      error: `Could not build a valid lesson from this text: ${validation.errors.join("; ")}`,
    };
  }

  return { ok: true, lesson };
}
