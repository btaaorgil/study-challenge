// Local, deterministic lesson importer (the "New lesson" screen).
//
// Turns pasted notes/slides into a Lesson with ONE SECTION PER TOPIC the
// notes actually teach -- a lesson that covers 2 things becomes 2 sections,
// one that covers 6 becomes 6. Topics are found in two ways:
//
// 1. Headings, when the notes have them: markdown `#`/`##`, "Chapter 2" /
//    "Part B" / "Topic: ..." style lines, "Something:" label lines, or short
//    standalone title lines followed by body text.
// 2. Otherwise, topic shifts: consecutive paragraphs (or, for a single wall of
//    text, runs of sentences) are grouped while they keep sharing key words,
//    and a new section starts when the vocabulary changes.
//
// This is plain text analysis, not an LLM, and it never makes a network call
// (.kiro/steering/storage.md, Requirement 10). Every Concept's text and
// sourceQuote are the learner's own sentences, unmodified -- nothing is
// fabricated or paraphrased into new claims.

import type { Concept, Lesson, LessonSection } from "./types";
import { MAX_SECTION_COUNT, validateLesson } from "./lesson";
import {
  contentWords,
  keywordSet,
  overlap,
  splitIntoSentences,
  titleCase,
  truncate,
} from "./text";

const TITLE_MAX_LENGTH = 100;
const EXPLANATION_MAX_LENGTH = 2000;
const CONCEPT_TEXT_MAX_LENGTH = 300;
const CONCEPTS_MAX_PER_SECTION = 20;
const MIN_SENTENCES_REQUIRED = 3;

/** Paragraphs sharing at least this share of key words are treated as one topic... */
const PARAGRAPH_SAME_TOPIC = 0.3;
/** ...as are paragraphs sharing at least this many key words outright. */
const PARAGRAPH_SHARED_WORDS = 2;

/** Openers that point back at the previous sentence/paragraph ("It...", "This means..."). */
const CONTINUATION =
  /^(?:it|its|they|their|this|these|that|those|he|she|his|her|such|also|however|therefore|thus|so|because|as a result|in addition|for example|for instance)\b/i;

/** Verbs that usually end the subject of a definition-style opening sentence. */
const SUBJECT_END =
  /\b(?:is|are|was|were|began|begins|refers|means|describes|became|becomes|has|have|had|can|will|takes|uses|occurs|happens|contains|consists|includes|involves|allows|lets|helps|shows|records|stores|produces|covers|explains)\b/i;

export type SectionizeResult =
  | { ok: true; lesson: Lesson }
  | { ok: false; error: string };

export interface SectionizeOptions {
  /** Optional lesson title typed by the learner; derived from the notes when blank. */
  title?: string;
}

/** A run of text that belongs to one topic, before it becomes a LessonSection. */
interface TopicGroup {
  heading?: string;
  /** Paragraphs, each a list of units (sentences or bullet lines). */
  paragraphs: string[][];
}

// ---------------------------------------------------------------------------
// Line-level parsing
// ---------------------------------------------------------------------------

const BULLET = /^\s*(?:[-*•▪◦‣–]|\(?(?:\d{1,2}|[a-z])[.)])\s+/i;
const NUMBERED = /^\s*\d{1,2}[.)]\s+/;
const MARKDOWN_HEADING = /^\s*(#{1,6})\s+(.+?)\s*#*\s*$/;
const KEYWORD_HEADING =
  /^\s*(?:chapter|part|section|unit|topic|lesson|module|week|lecture)\s+[\w.-]+\b/i;

function wordCount(line: string): number {
  return line.trim().split(/\s+/).filter(Boolean).length;
}

function looksLikeBody(line: string | undefined): boolean {
  if (!line) return false;
  const t = line.trim();
  return BULLET.test(t) || wordCount(t) >= 6 || /[.!?]$/.test(t);
}

function nextNonBlank(lines: string[], from: number): string | undefined {
  for (let i = from; i < lines.length; i++) {
    if (lines[i].trim().length > 0) return lines[i];
  }
  return undefined;
}

function headingLevel(lines: string[], i: number): number | undefined {
  const raw = lines[i];
  const t = raw.trim();
  if (t.length === 0) return undefined;

  const md = MARKDOWN_HEADING.exec(t);
  if (md) return md[1].length;

  // Bullets are list items, never headings -- unless it's a numbered title
  // line like "1. Photosynthesis" with body text under it (handled below).
  const isNumbered = NUMBERED.test(t);
  if (BULLET.test(t) && !isNumbered) return undefined;

  const words = wordCount(t);
  const next = nextNonBlank(lines, i + 1);

  if (KEYWORD_HEADING.test(t) && words <= 12 && !/[.!?]$/.test(t)) return 2;
  if (t.endsWith(":") && words <= 8 && !isNumbered && looksLikeBody(next)) return 3;

  const previousBlank = i === 0 || lines[i - 1].trim().length === 0;
  const shortTitle = words <= 8 && !/[.!?,;:]$/.test(t);
  if (shortTitle && previousBlank && looksLikeBody(next) && !looksLikeBody(t)) return 3;
  // "1. Photosynthesis" over a paragraph is a heading; "1. Nucleus" over
  // "2. Ribosome" is just a numbered list.
  if (shortTitle && isNumbered && looksLikeBody(next) && !NUMBERED.test(next ?? "")) return 3;

  return undefined;
}

function cleanHeading(line: string): string {
  return line
    .trim()
    .replace(MARKDOWN_HEADING, "$2")
    .replace(/^\d{1,2}[.)]\s+/, "")
    .replace(/:$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Splits one paragraph's lines into units: bullet lines stay whole, prose becomes sentences. */
function paragraphUnits(lines: string[]): string[] {
  const units: string[] = [];
  let prose: string[] = [];
  const flushProse = () => {
    if (prose.length > 0) units.push(...splitIntoSentences(prose.join(" ")));
    prose = [];
  };
  for (const line of lines) {
    if (BULLET.test(line)) {
      flushProse();
      const item = line.replace(BULLET, "").trim();
      if (item.length > 0) units.push(item.replace(/\s+/g, " "));
    } else {
      prose.push(line.trim());
    }
  }
  flushProse();
  return units;
}

interface ParsedNotes {
  lessonTitle?: string;
  preamble: string[][]; // paragraphs before the first heading
  headed: TopicGroup[];
}

function parseNotes(text: string): ParsedNotes {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const levels = lines.map((_, i) => headingLevel(lines, i));

  // A single leading "# Title" above "##" headings is the lesson's title,
  // not a topic of its own.
  let lessonTitle: string | undefined;
  const firstContent = lines.findIndex((l) => l.trim().length > 0);
  const h1Count = levels.filter((l) => l === 1).length;
  const hasDeeper = levels.some((l) => l !== undefined && l >= 2);
  if (firstContent >= 0 && levels[firstContent] === 1 && h1Count === 1 && hasDeeper) {
    lessonTitle = cleanHeading(lines[firstContent]);
    levels[firstContent] = undefined;
    lines[firstContent] = "";
  }

  const preamble: string[][] = [];
  const headed: TopicGroup[] = [];
  let paragraph: string[] = [];
  let target: string[][] = preamble;

  const flushParagraph = () => {
    const units = paragraphUnits(paragraph);
    if (units.length > 0) target.push(units);
    paragraph = [];
  };

  lines.forEach((line, i) => {
    if (levels[i] !== undefined) {
      flushParagraph();
      const group: TopicGroup = { heading: cleanHeading(line), paragraphs: [] };
      headed.push(group);
      target = group.paragraphs;
    } else if (line.trim().length === 0) {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
  });
  flushParagraph();

  return { lessonTitle, preamble, headed };
}

// ---------------------------------------------------------------------------
// Topic grouping
// ---------------------------------------------------------------------------

function groupUnits(group: TopicGroup): string[] {
  return group.paragraphs.flat();
}

function groupKeywords(group: TopicGroup): Set<string> {
  return keywordSet(groupUnits(group).join(" "));
}

/** Groups headed topics; headings with no body of their own fold into the next heading. */
function topicsFromHeadings(parsed: ParsedNotes): TopicGroup[] {
  const topics: TopicGroup[] = [];
  let pendingHeading: string | undefined;
  for (const group of parsed.headed) {
    if (group.paragraphs.length === 0) {
      pendingHeading = group.heading;
      continue;
    }
    // "Chapter 3" immediately followed by "Cell Respiration": keep the more
    // descriptive (second) heading.
    topics.push({ heading: group.heading ?? pendingHeading, paragraphs: group.paragraphs });
    pendingHeading = undefined;
  }

  const preambleUnits = parsed.preamble.flat();
  if (preambleUnits.length >= 2) {
    topics.unshift({ heading: "Overview", paragraphs: parsed.preamble });
  } else if (preambleUnits.length === 1 && topics.length > 0) {
    topics[0] = { ...topics[0], paragraphs: [...parsed.preamble, ...topics[0].paragraphs] };
  }
  return topics;
}

/** Groups un-headed notes by vocabulary shifts between paragraphs (or sentences). */
function sharedCount(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared++;
  return shared;
}

/**
 * Does `paragraph` continue the topic of `current`? In order:
 * 1. it opens by pointing back ("It...", "This means...") -> same topic;
 * 2. it mentions the current topic's subject ("...of photosynthesis") -> same;
 * 3. it opens by defining a different subject ("Mitosis is...") -> new topic;
 * 4. otherwise, decide by how much vocabulary they share.
 */
function sameTopicParagraph(current: TopicGroup, paragraph: string[]): boolean {
  const opener = paragraph[0] ?? "";
  if (CONTINUATION.test(opener)) return true;

  const own = keywordSet(paragraph.join(" "));
  const currentSubject = subjectOf(groupUnits(current)[0] ?? "");
  const subjectWords = currentSubject ? keywordSet(currentSubject) : new Set<string>();
  if (subjectWords.size > 0 && [...subjectWords].every((w) => own.has(w))) return true;

  const newSubject = subjectOf(opener);
  if (newSubject && overlap(keywordSet(newSubject), subjectWords) === 0) return false;

  const theirs = groupKeywords(current);
  return (
    sharedCount(own, theirs) >= PARAGRAPH_SHARED_WORDS + 1 ||
    overlap(own, theirs) >= PARAGRAPH_SAME_TOPIC
  );
}

function topicsFromVocabulary(paragraphs: string[][]): TopicGroup[] {
  if (paragraphs.length >= 2) {
    const groups: TopicGroup[] = [];
    for (const paragraph of paragraphs) {
      const current = groups[groups.length - 1];
      if (!current) {
        groups.push({ paragraphs: [paragraph] });
        continue;
      }
      if (sameTopicParagraph(current, paragraph)) current.paragraphs.push(paragraph);
      else groups.push({ paragraphs: [paragraph] });
    }
    return groups;
  }

  // One wall of text: cut before a sentence only when it shares nothing with
  // the topic so far AND the sentence after it confirms a new thread (it
  // shares words with the candidate or points back at it with "It"/"This").
  // Requiring confirmation stops every loosely-worded sentence from
  // becoming its own "topic".
  const sentences = paragraphs[0] ?? [];
  const groups: string[][] = [];
  sentences.forEach((sentence, i) => {
    const current = groups[groups.length - 1];
    if (!current) {
      groups.push([sentence]);
      return;
    }
    const own = keywordSet(sentence);
    const next = sentences[i + 1];
    const unrelated =
      !CONTINUATION.test(sentence) && sharedCount(own, keywordSet(current.join(" "))) === 0;
    const confirmed =
      next !== undefined && (CONTINUATION.test(next) || sharedCount(own, keywordSet(next)) > 0);
    if (unrelated && confirmed && current.length >= 2) groups.push([sentence]);
    else current.push(sentence);
  });
  return groups.map((units) => ({ paragraphs: [units] }));
}

function mergeGroups(a: TopicGroup, b: TopicGroup): TopicGroup {
  return { heading: a.heading ?? b.heading, paragraphs: [...a.paragraphs, ...b.paragraphs] };
}

/** Folds 1-sentence un-headed groups into their closest neighbour and caps the count. */
function tidyGroups(groups: TopicGroup[]): TopicGroup[] {
  let result = [...groups];

  let changed = true;
  while (changed && result.length > 1) {
    changed = false;
    const index = result.findIndex((g) => !g.heading && groupUnits(g).length < 2);
    if (index >= 0) {
      const target = pickMergeNeighbour(result, index);
      const [lo, hi] = index < target ? [index, target] : [target, index];
      result.splice(lo, 2, mergeGroups(result[lo], result[hi]));
      changed = true;
    }
  }

  while (result.length > MAX_SECTION_COUNT) {
    // Merge the most similar adjacent pair.
    let best = 0;
    let bestScore = -1;
    for (let i = 0; i < result.length - 1; i++) {
      const score = overlap(groupKeywords(result[i]), groupKeywords(result[i + 1]));
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    result.splice(best, 2, mergeGroups(result[best], result[best + 1]));
  }
  return result;
}

function pickMergeNeighbour(groups: TopicGroup[], index: number): number {
  if (index === 0) return 1;
  if (index === groups.length - 1) return index - 1;
  const own = groupKeywords(groups[index]);
  const before = overlap(own, groupKeywords(groups[index - 1]));
  const after = overlap(own, groupKeywords(groups[index + 1]));
  return after > before ? index + 1 : index - 1;
}

/** Splits any group with more units than a section can hold into numbered parts. */
function splitOversized(groups: TopicGroup[]): TopicGroup[] {
  const result: TopicGroup[] = [];
  for (const group of groups) {
    const units = groupUnits(group);
    if (units.length <= CONCEPTS_MAX_PER_SECTION) {
      result.push(group);
      continue;
    }
    const parts = Math.ceil(units.length / CONCEPTS_MAX_PER_SECTION);
    for (let p = 0; p < parts; p++) {
      const slice = units.slice(p * CONCEPTS_MAX_PER_SECTION, (p + 1) * CONCEPTS_MAX_PER_SECTION);
      const heading = group.heading ? `${group.heading} (part ${p + 1})` : undefined;
      result.push({ heading, paragraphs: [slice] });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Titles
// ---------------------------------------------------------------------------

/** Picks the words that make a group distinct from the other groups. */
function distinctiveWords(groups: TopicGroup[], index: number, count: number): string[] {
  const docFreq = new Map<string, number>();
  for (const group of groups) {
    for (const word of new Set(contentWords(groupUnits(group).join(" "), false))) {
      docFreq.set(word, (docFreq.get(word) ?? 0) + 1);
    }
  }
  const units = groupUnits(groups[index]);
  const firstSentence = new Set(contentWords(units[0] ?? "", false));
  const termFreq = new Map<string, number>();
  for (const word of contentWords(units.join(" "), false)) {
    termFreq.set(word, (termFreq.get(word) ?? 0) + 1);
  }
  return [...termFreq.entries()]
    .filter(([word]) => word.length >= 4)
    .map(([word, tf]) => {
      const idf = Math.log(1 + groups.length / (docFreq.get(word) ?? 1));
      const lead = firstSentence.has(word) ? 1.5 : 1;
      return { word, score: tf * idf * lead };
    })
    .sort((a, b) => b.score - a.score || a.word.localeCompare(b.word))
    .slice(0, count)
    .map(({ word }) => word);
}

/**
 * "Photosynthesis is the process..." -> "Photosynthesis";
 * "The French Revolution began in 1789..." -> "French Revolution".
 * Returns undefined when the opener isn't definition-shaped.
 */
function subjectOf(sentence: string): string | undefined {
  const match = SUBJECT_END.exec(sentence);
  if (!match) return undefined;
  const subject = sentence
    .slice(0, match.index)
    .replace(/^(?:the|a|an)\s+/i, "")
    .replace(/[,;:]+$/, "")
    .trim();
  const words = subject.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return undefined;
  if (CONTINUATION.test(subject) || words.every((w) => contentWords(w).length === 0)) return undefined;
  return titleCase(subject);
}

function deriveTitle(groups: TopicGroup[], index: number): string {
  const heading = groups[index].heading;
  if (heading) return truncate(heading, TITLE_MAX_LENGTH);
  const opener = groupUnits(groups[index])[0];
  const subject = opener ? subjectOf(opener) : undefined;
  if (subject) return truncate(subject, TITLE_MAX_LENGTH);
  const words = distinctiveWords(groups, index, 2).map(titleCase);
  return words.length > 0 ? words.join(" & ") : `Topic ${index + 1}`;
}

function uniqueTitles(titles: string[]): string[] {
  const counts = new Map<string, number>();
  return titles.map((title) => {
    const n = (counts.get(title) ?? 0) + 1;
    counts.set(title, n);
    return n === 1 ? title : `${title} (${n})`;
  });
}

function deriveLessonTitle(sectionTitles: string[]): string {
  const named = sectionTitles.filter((t) => t !== "Overview");
  const titles = named.length > 0 ? named : sectionTitles;
  if (titles.length === 1) return titles[0];
  if (titles.length <= 3) return `${titles.slice(0, -1).join(", ")} & ${titles[titles.length - 1]}`;
  return `${titles.slice(0, 2).join(", ")} & more`;
}

// ---------------------------------------------------------------------------
// Building the Lesson
// ---------------------------------------------------------------------------

function buildSection(group: TopicGroup, title: string): LessonSection {
  const units = groupUnits(group);
  // Prefer real statements for quizzing; keep short fragments only if that's all there is.
  const meaningful = units.filter((u) => u.split(/\s+/).length >= 3);
  const usable = (meaningful.length > 0 ? meaningful : units).slice(0, CONCEPTS_MAX_PER_SECTION);

  const concepts: Concept[] = usable.map((unit) => {
    const text = truncate(unit, CONCEPT_TEXT_MAX_LENGTH);
    return {
      id: crypto.randomUUID(),
      text,
      explanation: `This is covered in the \u201c${title}\u201d part of your notes.`,
      sourceQuote: text, // the learner's own sentence, exact substring of `text` (Req 5.4)
    };
  });

  return {
    id: crypto.randomUUID(),
    title,
    explanation: truncate(units.join(" "), EXPLANATION_MAX_LENGTH),
    concepts,
  };
}

/**
 * Splits raw pasted notes into a Lesson with one section per detected topic.
 * Returns an error (never throws) when there isn't enough content to quiz
 * on, rather than fabricating filler.
 */
export function sectionizeText(rawText: string, options: SectionizeOptions = {}): SectionizeResult {
  const trimmedInput = rawText.trim();
  if (trimmedInput.length === 0) {
    return { ok: false, error: "Paste some lesson content before processing." };
  }

  const parsed = parseNotes(trimmedInput);
  const headedTopics = topicsFromHeadings(parsed);
  const allUnits = [...parsed.preamble.flat(), ...parsed.headed.flatMap(groupUnits)];

  if (allUnits.length < MIN_SENTENCES_REQUIRED) {
    return {
      ok: false,
      error: `Not enough content to quiz you on yet. Add a bit more text (at least ${MIN_SENTENCES_REQUIRED} sentences or bullet points).`,
    };
  }

  const hasHeadedBody = parsed.headed.some((group) => group.paragraphs.length > 0);
  const rawGroups = hasHeadedBody ? headedTopics : topicsFromVocabulary(parsed.preamble);
  const groups = splitOversized(tidyGroups(rawGroups)).slice(0, MAX_SECTION_COUNT);

  const titles = uniqueTitles(groups.map((_, i) => deriveTitle(groups, i)));
  const sections = groups.map((group, i) => buildSection(group, titles[i]));

  const typedTitle = options.title?.trim();
  const lesson: Lesson = {
    id: crypto.randomUUID(),
    title: truncate(
      typedTitle || parsed.lessonTitle || deriveLessonTitle(titles),
      TITLE_MAX_LENGTH,
    ),
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
