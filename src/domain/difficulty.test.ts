import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { selectQuestions, optionCountFor } from "./challenge";
import { SAMPLE_LESSON } from "../data/sampleLesson";
import type { Difficulty, Lesson, Question } from "./types";

const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

function conceptOf(lesson: Lesson, question: Question) {
  for (const section of lesson.sections) {
    const concept = section.concepts.find((c) => c.id === question.conceptId);
    if (concept) return { section, concept };
  }
  throw new Error(`concept ${question.conceptId} not found`);
}

const correctText = (q: Question) => q.options.find((o) => o.id === q.correctOptionId)!.text;
const loose = (s: string) => s.toLowerCase().replace(/(?:es|s)$/, "");

describe("Difficulty changes how questions are built (Requirement 11)", () => {
  it("uses 3 options on Easy and 4 on Normal/Hard", () => {
    for (const difficulty of DIFFICULTIES) {
      const questions = selectQuestions(SAMPLE_LESSON, "seed-opts", 5, difficulty);
      for (const q of questions) {
        expect(q.options).toHaveLength(optionCountFor(difficulty));
      }
    }
  });

  it("never offers two options that are the same word (e.g. 'request' vs 'requests')", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), fc.constantFrom(...DIFFICULTIES), (seed, d) => {
        for (const q of selectQuestions(SAMPLE_LESSON, seed, 5, d)) {
          const keys = q.options.map((o) => loose(o.text));
          expect(new Set(keys).size).toBe(keys.length);
        }
      }),
      { numRuns: 60 },
    );
  });

  it("fill-in-the-blank: the answer is the blanked term and no wrong option appears in the sentence", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 12 }), fc.constantFrom<Difficulty>("normal", "hard"), (seed, d) => {
        for (const q of selectQuestions(SAMPLE_LESSON, seed, 5, d)) {
          if (!q.prompt.includes("_____")) continue;
          const { concept } = conceptOf(SAMPLE_LESSON, q);
          const sentence = concept.text.toLowerCase();
          expect(sentence.includes(correctText(q).toLowerCase())).toBe(true);
          for (const option of q.options) {
            if (option.id === q.correctOptionId) continue;
            expect(sentence.includes(option.text.toLowerCase())).toBe(false);
          }
        }
      }),
      { numRuns: 60 },
    );
  });

  it("Normal and Hard mostly ask fill-in-the-blank questions on a real lesson", () => {
    for (const d of ["normal", "hard"] as const) {
      const questions = selectQuestions(SAMPLE_LESSON, "seed-cloze", 5, d);
      expect(questions.filter((q) => q.prompt.includes("_____")).length).toBeGreaterThanOrEqual(4);
    }
  });

  it("Easy names the topic and draws wrong answers from other topics", () => {
    for (const q of selectQuestions(SAMPLE_LESSON, "seed-easy", 5, "easy")) {
      const { section } = conceptOf(SAMPLE_LESSON, q);
      expect(q.prompt).toContain(section.title);
      if (q.prompt.startsWith("Which of these comes from")) {
        const ownTexts = new Set(section.concepts.map((c) => c.text));
        for (const option of q.options) {
          if (option.id !== q.correctOptionId) expect(ownTexts.has(option.text)).toBe(false);
        }
      }
    }
  });

  it("Hard gives no topic hint and prefers look-alike wrong answers from the same topic", () => {
    let sameTopicDistractors = 0;
    let totalDistractors = 0;
    for (const seed of ["h1", "h2", "h3", "h4"]) {
      for (const q of selectQuestions(SAMPLE_LESSON, seed, 5, "hard")) {
        const { section } = conceptOf(SAMPLE_LESSON, q);
        expect(q.prompt).not.toContain(section.title);
        if (!q.prompt.includes("_____")) continue;
        const sectionText = section.concepts.map((c) => c.text.toLowerCase()).join(" ");
        for (const option of q.options) {
          if (option.id === q.correctOptionId) continue;
          totalDistractors++;
          if (sectionText.includes(option.text.toLowerCase())) sameTopicDistractors++;
        }
      }
    }
    expect(sameTopicDistractors / totalDistractors).toBeGreaterThan(0.5);
  });
});
