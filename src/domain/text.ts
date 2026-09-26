// Small, dependency-free text helpers shared by the lesson importer
// (topic detection, section titles) and question generation (picking the
// key term to blank out). Everything here is deterministic and local.

const STOPWORDS = new Set(
  (
    "a about above after again against all also am an and any are as at be because been before " +
    "being below between both but by can could did do does doing down during each either else " +
    "etc even ever every few for from further get gets got had has have having he her here hers " +
    "him his how however i if in into is it its itself just let like made make makes many may me " +
    "might more most much must my no nor not now of off often on once one only or other our out " +
    "over own per rather same she should so some such than that the their them then there these " +
    "they this those through thus to too two under until up upon us use used uses using very via " +
    "was we were what when where whether which while who whom whose why will with within without " +
    "would yet you your yours also called known called means mean usually always never something " +
    "things thing way ways well new first second third lot lots really"
  ).split(/\s+/),
);

export function isStopword(word: string): boolean {
  return STOPWORDS.has(word.toLowerCase());
}

// Generic verbs/adjectives that make weak blanks ("It takes _____ in...").
const WEAK_WORDS = new Set(
  (
    "take takes taken place places happen happens happened face faces faced mean means stay stays " +
    "grow grows change changes become becomes fire fires make makes give gives keep keeps work works " +
    "need needs want wants turn turns show shows help helps find finds allow allows include includes " +
    "return returns represent represents remain remains start starts begin begins cause causes " +
    "different important common certain various several large small good best main part parts " +
    "kind kinds type types example examples number numbers amount level levels point time times " +
    "year years people person"
  ).split(/\s+/),
);

function isQuizzableWord(word: string): boolean {
  const lower = word.toLowerCase();
  if (WEAK_WORDS.has(lower)) return false;
  if (/['’]/.test(word)) return false; // contractions
  if (lower.length > 4 && lower.endsWith("ly")) return false; // adverbs
  return true;
}

/**
 * Lowercased content words (no stopwords, length >= 3). Stemmed by default
 * so "cells"/"cell" compare equal; pass `stemmed = false` for display use.
 */
export function contentWords(text: string, stemmed: boolean = true): string[] {
  const words = text.toLowerCase().match(/[a-z][a-z0-9'-]*/g) ?? [];
  const filtered = words
    .map((w) => w.replace(/'s$/, "").replace(/-+$/, ""))
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  return stemmed ? filtered.map(stem) : filtered;
}

/** Very light stemming so "cells"/"cell" and "processes"/"process" match. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && word.endsWith("sses")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us")) {
    return word.slice(0, -1);
  }
  return word;
}

export function keywordSet(text: string): Set<string> {
  return new Set(contentWords(text));
}

/** Overlap coefficient: |A ∩ B| / min(|A|, |B|). 0 when either set is empty. */
export function overlap(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const word of small) if (large.has(word)) shared++;
  return shared / small.size;
}

export function splitIntoSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=["'“(A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1).trimEnd() + "\u2026";
}

// ---------------------------------------------------------------------------
// Key-term extraction (used to build fill-in-the-blank questions)
// ---------------------------------------------------------------------------

export type TermKind = "number" | "proper" | "word";

export interface Term {
  /** The term exactly as written in the sentence. */
  text: string;
  kind: TermKind;
  /** Higher = a better thing to quiz on (more specific / informative). */
  weight: number;
}

const TOKEN_PATTERN = /\d[\d,.]*%?|[A-Za-z][A-Za-z0-9'’-]*/g;

/**
 * Candidate terms in a sentence, best first. Consecutive capitalized words
 * ("Linus Torvalds", "World War II") are kept together as one proper term.
 */
export function extractTerms(sentence: string): Term[] {
  const tokens: Array<{ text: string; index: number }> = [];
  for (const match of sentence.matchAll(TOKEN_PATTERN)) {
    tokens.push({ text: match[0].replace(/[.,]+$/, ""), index: match.index ?? 0 });
  }

  const terms: Term[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const word = token.text;
    if (word.length === 0) continue;

    if (/^\d/.test(word)) {
      terms.push({ text: word, kind: "number", weight: 6 });
      continue;
    }

    const isCapitalized = /^[A-Z]/.test(word);
    const isSentenceStart = i === 0;
    if (isCapitalized && !isStopword(word)) {
      // Join a run of capitalized words into one proper noun phrase.
      const parts = [word];
      let j = i + 1;
      while (
        j < tokens.length &&
        /^[A-Z0-9]/.test(tokens[j].text) &&
        !isStopword(tokens[j].text) &&
        sentence.slice(tokens[j - 1].index + tokens[j - 1].text.length, tokens[j].index) === " "
      ) {
        parts.push(tokens[j].text);
        j++;
      }
      const phrase = parts.join(" ");
      // A lone capitalized first word is usually just sentence case, not a name.
      if (!(isSentenceStart && parts.length === 1)) {
        terms.push({ text: phrase, kind: "proper", weight: 5 + parts.length });
        i = j - 1;
        continue;
      }
    }

    if (word.length >= 4 && !isStopword(word) && isQuizzableWord(word)) {
      let weight = Math.min(word.length, 12) / 3;
      // Past-tense / -ing forms are usually the verb, not the idea being taught.
      if (/(?:ed|ing)$/i.test(word)) weight *= 0.5;
      if (word.includes("-")) weight += 1;
      terms.push({ text: word, kind: "word", weight });
    }
  }

  // De-duplicate case-insensitively, keep the best-weighted occurrence.
  const seen = new Set<string>();
  return terms
    .sort((a, b) => b.weight - a.weight)
    .filter((term) => {
      const key = term.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

/** Replaces every whole-word occurrence of `term` in `sentence` with a blank. */
export function blankOut(sentence: string, term: string): string {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return sentence.replace(new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "g"), "_____");
}
