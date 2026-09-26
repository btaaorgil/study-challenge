// Daily_Challenge and exam generation.
// See design.md: "Domain: generateDailyChallenge (src/domain/challenge.ts)".
// Requirements: 3.1-3.6 (challenge/question shape, distinctness, reuse, idempotent reopen),
// 5.3/5.4 (source traceability, excluding unusable concepts), 9.5 (same-day restore),
// 11 (difficulty), 12 (Test Yourself exam).
//
// Question styles, picked per concept:
// - Fill-in-the-blank ("cloze"): a sentence from the lesson with its key term
//   blanked out; the options are that term plus other terms from the lesson.
//   Every wrong option really is wrong for that sentence, which fixes the old
//   "all four options are true facts" problem the quiz-auditor flagged.
// - Topic match: "Which of these comes from <topic>?" with statements from
//   other topics as the wrong options (only when the lesson has 2+ topics).
// - Statement pick (legacy fallback for concepts with no usable key term).
//
// Difficulty changes how the question is built, not how it's scored:
// - easy:   3 options, topic-match first, distractors from other topics, topic named in the prompt
// - normal: 4 options, fill-in-the-blank, distractors of the same kind from anywhere in the lesson
// - hard:   4 options, fill-in-the-blank on the most specific term, look-alike distractors from the
//           SAME topic (same kind, similar length), no topic hint

import type { StorageLayer } from "../storage/db";
import type {
  AnswerOption,
  Concept,
  DailyChallenge,
  Difficulty,
  Lesson,
  LessonSection,
  Question,
} from "./types";
import { createSeededRng, seededShuffle } from "./prng";
import { blankOut, extractTerms, type TermKind } from "./text";

export const DAILY_QUESTION_COUNT = 5;
export const EXAM_MAX_QUESTIONS = 20;
const SEED_SEPARATOR = ":";

/** Number of answer options a question has at each difficulty. */
export function optionCountFor(difficulty: Difficulty): number {
  return difficulty === "easy" ? 3 : 4;
}

interface PooledConcept {
  concept: Concept;
  section: LessonSection;
}

interface PoolTerm {
  display: string;
  key: string; // lowercased, for de-duplication / "appears in sentence" checks
  kind: TermKind;
  sectionId: string;
  quality: number; // how good a quiz term it is within this lesson
}

interface TermPool {
  terms: PoolTerm[];
  /** How many concepts in the lesson mention each term key. */
  mentions: Map<string, number>;
  /** Words the lesson capitalizes mid-sentence somewhere, i.e. names ("Mars", "Jupiter"). */
  properKeys: Set<string>;
}

/**
 * A sentence-initial "Jupiter" looks like an ordinary word to extractTerms;
 * if the lesson capitalizes it mid-sentence elsewhere, treat it as a name so
 * it keeps its capital letter and competes with other names.
 */
function resolveTerm<T extends { text: string; kind: TermKind; weight: number }>(
  term: T,
  properKeys: Set<string>,
): T {
  if (term.kind === "word" && properKeys.has(term.text.toLowerCase())) {
    return { ...term, kind: "proper", weight: Math.max(term.weight, 6) };
  }
  return term;
}

/**
 * Lesson-aware weight: terms the lesson keeps coming back to, or that name
 * the topic, are the ones worth testing.
 */
function termQuality(
  term: { text: string; weight: number },
  mentions: Map<string, number>,
  sectionTitle: string,
): number {
  const key = term.text.toLowerCase();
  let quality = term.weight;
  if ((mentions.get(key) ?? 0) >= 2) quality += 2;
  if (sectionTitle.toLowerCase().includes(key)) quality += 3;
  return quality;
}

function flattenConcepts(lesson: Lesson): PooledConcept[] {
  const pooled: PooledConcept[] = [];
  for (const section of lesson.sections) {
    for (const concept of section.concepts) {
      pooled.push({ concept, section });
    }
  }
  return pooled;
}

/** Lowercase ordinary words so option casing never gives the answer away. */
function displayFor(text: string, kind: TermKind): string {
  return kind === "word" ? text.toLowerCase() : text;
}

function buildTermPool(all: PooledConcept[]): TermPool {
  const raw = all.map(({ concept, section }) => ({ section, terms: extractTerms(concept.text) }));

  const properKeys = new Set<string>();
  for (const { terms } of raw) {
    for (const term of terms) if (term.kind === "proper") properKeys.add(term.text.toLowerCase());
  }
  const extracted = raw.map(({ section, terms }) => ({
    section,
    terms: terms.map((t) => resolveTerm(t, properKeys)),
  }));

  const mentions = new Map<string, number>();
  for (const { terms } of extracted) {
    for (const term of terms) {
      const key = term.text.toLowerCase();
      mentions.set(key, (mentions.get(key) ?? 0) + 1);
    }
  }

  const seen = new Set<string>();
  const terms: PoolTerm[] = [];
  for (const { section, terms: sentenceTerms } of extracted) {
    for (const term of sentenceTerms) {
      const key = term.text.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      terms.push({
        display: displayFor(term.text, term.kind),
        key,
        kind: term.kind,
        sectionId: section.id,
        quality: termQuality(term, mentions, section.title),
      });
    }
  }
  return { terms, mentions, properKeys };
}

/**
 * A concept is usable as a Question's correct-answer source only if it has a
 * non-empty explanation and a sourceQuote that is a non-empty, exact
 * substring of either its own text or its section's explanation
 * (Requirement 5.4). Concepts that fail this check are never selected.
 */
function isUsable({ concept, section }: PooledConcept): boolean {
  const explanation = concept.explanation.trim();
  const sourceQuote = concept.sourceQuote.trim();
  if (explanation.length === 0 || sourceQuote.length === 0) return false;
  return (
    concept.text.includes(concept.sourceQuote) ||
    section.explanation.includes(concept.sourceQuote)
  );
}

interface Draft {
  prompt: string;
  correctText: string;
  distractorTexts: string[];
}

// ---------------------------------------------------------------------------
// Question styles
// ---------------------------------------------------------------------------

function clozeDraft(
  pooled: PooledConcept,
  termPool: TermPool,
  difficulty: Difficulty,
  rng: () => number,
): Draft | undefined {
  const { concept, section } = pooled;
  const pool = termPool.terms;
  const needed = optionCountFor(difficulty) - 1;
  const sentenceLower = concept.text.toLowerCase();
  const terms = extractTerms(concept.text)
    .map((term) => resolveTerm(term, termPool.properKeys))
    .map((term) => ({ ...term, quality: termQuality(term, termPool.mentions, section.title) }))
    .sort((a, b) => b.quality - a.quality);
  if (terms.length === 0) return undefined;

  // Hard always tests the most specific term; normal/easy vary it a little.
  const ordered =
    difficulty === "hard"
      ? terms
      : [...seededShuffle(terms.slice(0, 3), rng), ...terms.slice(3)];

  for (const term of ordered) {
    const prompt = blankOut(concept.text, term.text);
    if (!prompt.includes("_____")) continue;

    const answer = displayFor(term.text, term.kind);
    const candidates = pool.filter(
      (p) => p.key !== term.text.toLowerCase() && !sentenceLower.includes(p.key),
    );
    const ranked = rankDistractors(candidates, term.kind, answer, section.id, difficulty, rng);
    const picked: string[] = [];
    // Compare singular-ish forms so "chloroplast" never competes with the
    // answer "chloroplasts" (that would make two options correct).
    const used = new Set([looseKey(answer)]);
    for (const candidate of ranked) {
      if (picked.length >= needed) break;
      const key = looseKey(candidate.display);
      if (used.has(key)) continue;
      used.add(key);
      picked.push(candidate.display);
    }
    if (picked.length < needed) continue;

    const lead =
      difficulty === "easy" ? `From \u201c${section.title}\u201d \u2014 fill in the blank:` : "Fill in the blank:";
    return { prompt: `${lead} \u201c${prompt}\u201d`, correctText: answer, distractorTexts: picked };
  }
  return undefined;
}

function looseKey(text: string): string {
  return text.toLowerCase().replace(/(?:es|s)$/, "");
}

function rankDistractors(
  candidates: PoolTerm[],
  kind: TermKind,
  answer: string,
  sectionId: string,
  difficulty: Difficulty,
  rng: () => number,
): PoolTerm[] {
  const shuffled = seededShuffle(candidates, rng);
  // Prefer meaningful terms as options so wrong answers look like real answers.
  // Coarse on purpose: a strict ranking would reuse the same few "best" terms
  // as wrong answers on every question.
  const plausibility = (c: PoolTerm): number => (c.quality >= 3 ? 1 : 0);
  const score = (c: PoolTerm): number => {
    if (difficulty === "easy") {
      // Easy: obviously-different options -- other topics, other kinds.
      return (c.sectionId !== sectionId ? 2 : 0) + (c.kind !== kind ? 1 : 0);
    }
    let s = (c.kind === kind ? 4 : 0) + plausibility(c);
    if (difficulty === "hard") {
      if (c.sectionId === sectionId) s += 3;
      if (Math.abs(c.display.length - answer.length) <= 3) s += 1;
    }
    return s;
  };
  // Stable sort keeps the seeded shuffle order within equal scores.
  return shuffled
    .map((c, i) => ({ c, i, s: score(c) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map(({ c }) => c);
}

function topicMatchDraft(
  pooled: PooledConcept,
  all: PooledConcept[],
  difficulty: Difficulty,
  rng: () => number,
): Draft | undefined {
  const needed = optionCountFor(difficulty) - 1;
  const others = seededShuffle(
    all.filter((p) => p.section.id !== pooled.section.id),
    rng,
  );
  const picked: string[] = [];
  const used = new Set([pooled.concept.text]);
  for (const other of others) {
    if (picked.length >= needed) break;
    if (used.has(other.concept.text)) continue;
    used.add(other.concept.text);
    picked.push(other.concept.text);
  }
  if (picked.length < needed) return undefined;
  return {
    prompt: `Which of these comes from \u201c${pooled.section.title}\u201d?`,
    correctText: pooled.concept.text,
    distractorTexts: picked,
  };
}

/**
 * Last-resort style for concepts with no usable key term and no other
 * topics to contrast with: pick the statement about this topic. Pads with
 * whatever lesson text exists so the question is always well-formed.
 */
function statementDraft(
  pooled: PooledConcept,
  all: PooledConcept[],
  difficulty: Difficulty,
  rng: () => number,
): Draft {
  const needed = optionCountFor(difficulty) - 1;
  const sameSection = all.filter(
    (p) => p.section.id === pooled.section.id && p.concept.id !== pooled.concept.id,
  );
  const rest = all.filter(
    (p) => p.section.id !== pooled.section.id && p.concept.id !== pooled.concept.id,
  );
  const seen = new Set<string>();
  const candidates: PooledConcept[] = [];
  for (const candidate of [...sameSection, ...rest]) {
    if (!seen.has(candidate.concept.id)) {
      seen.add(candidate.concept.id);
      candidates.push(candidate);
    }
  }
  const shuffled = seededShuffle(candidates, rng);
  const distractorTexts: string[] = [];
  for (const candidate of shuffled) {
    if (distractorTexts.length >= needed) break;
    if (candidate.concept.text !== pooled.concept.text) distractorTexts.push(candidate.concept.text);
  }
  let cycleIndex = 0;
  while (distractorTexts.length < needed && shuffled.length > 0) {
    distractorTexts.push(shuffled[cycleIndex % shuffled.length].concept.text);
    cycleIndex++;
  }
  while (distractorTexts.length < needed) {
    distractorTexts.push(`(no alternative available ${distractorTexts.length})`);
  }
  return {
    prompt: `According to \u201c${pooled.section.title}\u201d, which of the following is correct?`,
    correctText: pooled.concept.text,
    distractorTexts,
  };
}

function buildQuestion(
  pooled: PooledConcept,
  all: PooledConcept[],
  pool: TermPool,
  questionId: string,
  rng: () => number,
  difficulty: Difficulty,
): Question {
  const draft =
    difficulty === "easy"
      ? topicMatchDraft(pooled, all, difficulty, rng) ??
        clozeDraft(pooled, pool, difficulty, rng) ??
        statementDraft(pooled, all, difficulty, rng)
      : clozeDraft(pooled, pool, difficulty, rng) ??
        topicMatchDraft(pooled, all, difficulty, rng) ??
        statementDraft(pooled, all, difficulty, rng);

  const correctOption: AnswerOption = { id: `${questionId}:optCorrect`, text: draft.correctText };
  const distractorOptions: AnswerOption[] = draft.distractorTexts.map((text, i) => ({
    id: `${questionId}:optDistractor${i}`,
    text,
  }));

  return {
    id: questionId,
    sectionId: pooled.section.id,
    conceptId: pooled.concept.id,
    prompt: draft.prompt,
    options: seededShuffle([correctOption, ...distractorOptions], rng),
    correctOptionId: correctOption.id,
    explanation: pooled.concept.explanation,
    sourceQuote: pooled.concept.sourceQuote,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Pure, deterministic helper: given the same Lesson, seed, and difficulty,
 * always produces the same Questions in the same order (no `Math.random()`
 * anywhere in this module).
 *
 * Throws if the Lesson has zero usable concepts (Requirement 5.4).
 */
export function selectQuestions(
  lesson: Lesson,
  seed: string,
  count: number = DAILY_QUESTION_COUNT,
  difficulty: Difficulty = "normal",
): Question[] {
  const allConcepts = flattenConcepts(lesson);
  const usable = allConcepts.filter(isUsable);

  if (usable.length === 0) {
    throw new Error(
      `selectQuestions: lesson "${lesson.id}" has no usable concepts (none have a derivable explanation and sourceQuote)`,
    );
  }

  const rng = createSeededRng(seed);
  const shuffledUsable = seededShuffle(usable, rng);
  const pool = buildTermPool(allConcepts);

  const chosen: PooledConcept[] = [];
  for (let i = 0; i < count; i++) {
    // Distinct concepts while the pool lasts, then round-robin (Requirement 3.6).
    chosen.push(shuffledUsable[i % shuffledUsable.length]);
  }

  return chosen.map((pooled, i) =>
    buildQuestion(
      pooled,
      allConcepts,
      pool,
      `${lesson.id}${SEED_SEPARATOR}${seed}${SEED_SEPARATOR}q${i}`,
      rng,
      difficulty,
    ),
  );
}

/** Seed for a day's challenge. "normal" keeps the original format so older saved days still match. */
function dailySeed(dateKey: string, lessonId: string, difficulty: Difficulty): string {
  const base = `${dateKey}${SEED_SEPARATOR}${lessonId}`;
  return difficulty === "normal" ? base : `${base}${SEED_SEPARATOR}${difficulty}`;
}

/**
 * Get-or-create for the current day. Returns the stored Daily_Challenge
 * unchanged when it's for this lesson and either matches the requested
 * difficulty or has already been started (answers are locked in for the
 * day -- Requirements 3.5, 4.3, 11.4). Otherwise generates and persists a
 * fresh one.
 */
export async function getOrCreateDailyChallenge(
  dateKey: string,
  lesson: Lesson,
  storage: StorageLayer,
  difficulty: Difficulty = "normal",
): Promise<DailyChallenge> {
  const existing = await storage.getDailyChallenge(dateKey);
  if (existing && existing.lessonId === lesson.id) {
    if ((existing.difficulty ?? "normal") === difficulty) return existing;
    const attempts = await storage.getAttempts(dateKey);
    const questionIds = new Set(existing.questions.map((q) => q.id));
    if (attempts.some((a) => questionIds.has(a.questionId))) return existing;
  }

  return generateAndPersistDailyChallenge(dateKey, lesson, storage, difficulty);
}

/**
 * Unconditionally (re)generates today's Daily_Challenge from `lesson` and
 * persists it, overwriting whatever was previously stored for `dateKey`.
 */
export async function generateAndPersistDailyChallenge(
  dateKey: string,
  lesson: Lesson,
  storage: StorageLayer,
  difficulty: Difficulty = "normal",
): Promise<DailyChallenge> {
  const questions = selectQuestions(
    lesson,
    dailySeed(dateKey, lesson.id, difficulty),
    DAILY_QUESTION_COUNT,
    difficulty,
  );
  const challenge: DailyChallenge = { dateKey, lessonId: lesson.id, questions, difficulty };

  await storage.putDailyChallenge(challenge);
  return challenge;
}

/**
 * Builds a "Test Yourself" exam over the WHOLE lesson: every topic is
 * covered, topics take turns so none is skipped, and each usable concept is
 * asked at most once (up to `maxQuestions`). Lessons with fewer than 5
 * usable concepts reuse them to reach 5 questions. Not persisted as a
 * Daily_Challenge -- exams are an on-demand self-check (Requirement 12).
 */
export function buildExam(
  lesson: Lesson,
  seed: string,
  difficulty: Difficulty = "normal",
  maxQuestions: number = EXAM_MAX_QUESTIONS,
): DailyChallenge {
  const all = flattenConcepts(lesson);
  const pool = buildTermPool(all);
  const rng = createSeededRng(`${seed}${SEED_SEPARATOR}exam`);

  const perSection = lesson.sections
    .map((section) => seededShuffle(all.filter((p) => p.section.id === section.id && isUsable(p)), rng))
    .filter((list) => list.length > 0);

  const totalUsable = perSection.reduce((sum, list) => sum + list.length, 0);
  const target = Math.min(maxQuestions, Math.max(totalUsable, DAILY_QUESTION_COUNT));

  const chosen: PooledConcept[] = [];
  for (let round = 0; chosen.length < target && totalUsable > 0; round++) {
    for (const list of perSection) {
      if (chosen.length >= target) break;
      // Past the first full pass we're reusing concepts (tiny lessons only).
      if (round < list.length || totalUsable < target) chosen.push(list[round % list.length]);
    }
  }

  const questions = seededShuffle(
    chosen.map((pooled, i) =>
      buildQuestion(
        pooled,
        all,
        pool,
        `${lesson.id}${SEED_SEPARATOR}exam${SEED_SEPARATOR}${seed}${SEED_SEPARATOR}q${i}`,
        rng,
        difficulty,
      ),
    ),
    rng,
  );

  return {
    dateKey: `exam${SEED_SEPARATOR}${seed}`,
    lessonId: lesson.id,
    questions,
    difficulty,
  };
}

/**
 * Formats a Date using its local (not UTC) calendar date as "YYYY-MM-DD",
 * per design.md's "Calendar day determination" (Requirement 9.5).
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
