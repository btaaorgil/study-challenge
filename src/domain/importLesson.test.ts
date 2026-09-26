import { describe, expect, it } from "vitest";
import { sectionizeText } from "./importLesson";
import { validateLesson } from "./lesson";

const RICH_NOTES = `
Photosynthesis is the process plants use to convert light energy into chemical energy. It occurs mainly in the chloroplasts of plant cells. Chlorophyll is the pigment that absorbs light for this process. Oxygen is released as a byproduct of photosynthesis.

Cellular respiration is how cells break down glucose to release energy. It happens in the mitochondria of the cell. ATP is the main energy currency produced by respiration. Carbon dioxide is released as a byproduct of respiration.

Mitosis is the process of cell division that produces two identical daughter cells. It is used for growth and tissue repair in the body. The cell cycle includes phases like prophase, metaphase, anaphase, and telophase. Chromosomes are copied before mitosis begins so each daughter cell gets a full set.

DNA is the molecule that carries genetic information in living things. It is shaped like a double helix. Genes are segments of DNA that code for specific proteins. Mutations are changes in DNA sequence that can affect an organism's traits.
`;

describe("sectionizeText: local, deterministic lesson import", () => {
  it("splits rich multi-paragraph notes into a structurally valid 4-section Lesson", () => {
    const result = sectionizeText(RICH_NOTES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.lesson.sections).toHaveLength(4);
    const validation = validateLesson(result.lesson);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);
  });

  it("gives every Concept a sourceQuote that is an exact substring of its own text (no fabrication)", () => {
    const result = sectionizeText(RICH_NOTES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    for (const section of result.lesson.sections) {
      for (const concept of section.concepts) {
        expect(concept.text.includes(concept.sourceQuote)).toBe(true);
      }
    }
  });

  it("is deterministic: the same input text produces sections with the same content (ids differ, text doesn't)", () => {
    const first = sectionizeText(RICH_NOTES);
    const second = sectionizeText(RICH_NOTES);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;

    const firstTexts = first.lesson.sections.map((s) => s.concepts.map((c) => c.text));
    const secondTexts = second.lesson.sections.map((s) => s.concepts.map((c) => c.text));
    expect(secondTexts).toEqual(firstTexts);
  });

  it("returns an error for empty input", () => {
    const result = sectionizeText("   ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.length).toBeGreaterThan(0);
  });

  it("returns an error when there isn't enough content for 4 sections", () => {
    const result = sectionizeText("Too short.");
    expect(result.ok).toBe(false);
  });

  it("falls back to sentence-splitting when there are fewer paragraphs than sections", () => {
    // A single paragraph with plenty of sentences should still produce 4 sections.
    const singleParagraph =
      "Sentence one is about topic A. Sentence two is about topic B. " +
      "Sentence three is about topic C. Sentence four is about topic D. " +
      "Sentence five adds more about topic A. Sentence six adds more about topic B. " +
      "Sentence seven adds more about topic C. Sentence eight adds more about topic D.";

    const result = sectionizeText(singleParagraph);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lesson.sections).toHaveLength(4);
    expect(validateLesson(result.lesson).valid).toBe(true);
  });

  it("never produces a section with zero concepts", () => {
    const result = sectionizeText(RICH_NOTES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const section of result.lesson.sections) {
      expect(section.concepts.length).toBeGreaterThan(0);
    }
  });
});
