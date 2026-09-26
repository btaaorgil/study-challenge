import { describe, expect, it } from "vitest";
import { sectionizeText } from "./importLesson";
import { MAX_SECTION_COUNT, validateLesson } from "./lesson";

// Four paragraphs, four different subjects, no headings.
const RICH_NOTES = `
Photosynthesis is the process plants use to convert light energy into chemical energy. It occurs mainly in the chloroplasts of plant cells. Chlorophyll is the pigment that absorbs light for this process. Oxygen is released as a byproduct of photosynthesis.

Cellular respiration is how cells break down glucose to release energy. It happens in the mitochondria of the cell. ATP is the main energy currency produced by respiration. Carbon dioxide is released as a byproduct of respiration.

Mitosis is the process of cell division that produces two identical daughter cells. It is used for growth and tissue repair in the body. The cell cycle includes phases like prophase, metaphase, anaphase, and telophase. Chromosomes are copied before mitosis begins so each daughter cell gets a full set.

DNA is the molecule that carries genetic information in living things. It is shaped like a double helix. Genes are segments of DNA that code for specific proteins. Mutations are changes in DNA sequence that can affect an organism's traits.
`;

// Two topics; the second photosynthesis paragraph must stay with the first.
const TWO_TOPICS = `Photosynthesis is the process plants use to turn light into chemical energy. It takes place in the chloroplasts of leaf cells. Chlorophyll absorbs mostly red and blue light and reflects green light.

The light-dependent reactions happen in the thylakoid membranes of the chloroplast. They split water and release oxygen as a by-product of photosynthesis.

The French Revolution began in 1789 when the Estates-General met at Versailles. King Louis XVI faced a severe financial crisis after years of war. The storming of the Bastille on 14 July became a symbol of the revolution.`;

const MARKDOWN = `# Biology 101

## Cell Structure
The nucleus stores the cell's DNA. Mitochondria produce ATP through cellular respiration. Ribosomes build proteins from amino acids.

## Genetics
Genes are segments of DNA that code for proteins. Gregor Mendel studied inheritance using pea plants in the 1860s.

## Evolution
Charles Darwin proposed natural selection in 1859. Species change over many generations as advantageous traits spread.`;

const PLAIN_HEADINGS = `Supply and Demand
When prices rise, the quantity demanded usually falls. When prices fall, suppliers usually produce less.

Inflation
Inflation is a general increase in prices over time. Central banks raise interest rates to slow inflation.

Key terms:
- GDP measures the total value of goods and services produced
- A recession is two consecutive quarters of negative GDP growth`;

const WALL_OF_TEXT =
  "Git is a distributed version control system created by Linus Torvalds in 2005. " +
  "A commit records a snapshot of the repository at a point in time. " +
  "Branches let developers work on features in isolation before merging. " +
  "The Pacific Ocean is the largest and deepest ocean on Earth. " +
  "It covers more than 60 million square miles of the planet. " +
  "The Mariana Trench in the Pacific Ocean is the deepest known point on Earth.";

function titles(text: string): string[] {
  const result = sectionizeText(text);
  if (!result.ok) throw new Error(result.error);
  return result.lesson.sections.map((s) => s.title);
}

describe("sectionizeText: one section per topic", () => {
  it("splits four un-headed paragraphs about four subjects into 4 sections, titled by subject", () => {
    expect(titles(RICH_NOTES)).toEqual(["Photosynthesis", "Cellular respiration", "Mitosis", "DNA"]);
  });

  it("keeps follow-up paragraphs on the same subject together (2 topics -> 2 sections)", () => {
    const result = sectionizeText(TWO_TOPICS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lesson.sections.map((s) => s.title)).toEqual(["Photosynthesis", "French Revolution"]);
    expect(result.lesson.sections[0].concepts).toHaveLength(5);
    expect(result.lesson.title).toBe("Photosynthesis & French Revolution");
  });

  it("uses markdown headings as topics and a lone top '#' heading as the lesson title", () => {
    const result = sectionizeText(MARKDOWN);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lesson.title).toBe("Biology 101");
    expect(result.lesson.sections.map((s) => s.title)).toEqual(["Cell Structure", "Genetics", "Evolution"]);
  });

  it("recognizes plain title lines and 'Label:' lines as headings, and bullets as points", () => {
    const result = sectionizeText(PLAIN_HEADINGS);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lesson.sections.map((s) => s.title)).toEqual(["Supply and Demand", "Inflation", "Key terms"]);
    expect(result.lesson.sections[2].concepts.map((c) => c.text)).toEqual([
      "GDP measures the total value of goods and services produced",
      "A recession is two consecutive quarters of negative GDP growth",
    ]);
  });

  it("finds topic changes inside a single wall of text", () => {
    expect(titles(WALL_OF_TEXT)).toEqual(["Git", "Pacific Ocean"]);
  });

  it("keeps a single-topic lesson as a single section", () => {
    const oneTopic =
      "Photosynthesis turns light into chemical energy. Photosynthesis happens in chloroplasts. " +
      "The chlorophyll in chloroplasts absorbs light for photosynthesis.";
    expect(titles(oneTopic)).toHaveLength(1);
  });

  it("uses the typed title when one is given", () => {
    const result = sectionizeText(MARKDOWN, { title: "  My biology notes  " });
    expect(result.ok && result.lesson.title).toBe("My biology notes");
  });

  it(`caps very long notes at ${MAX_SECTION_COUNT} sections`, () => {
    const many = Array.from(
      { length: 20 },
      (_, i) => `## Topic ${i + 1}\nFact number ${i + 1} is an important statement about this topic.`,
    ).join("\n\n");
    const result = sectionizeText(many);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.lesson.sections.length).toBe(MAX_SECTION_COUNT);
    expect(validateLesson(result.lesson).valid).toBe(true);
  });
});

describe("sectionizeText: validity and fidelity", () => {
  for (const [name, text] of Object.entries({ RICH_NOTES, TWO_TOPICS, MARKDOWN, PLAIN_HEADINGS, WALL_OF_TEXT })) {
    it(`${name}: produces a structurally valid lesson with no empty sections`, () => {
      const result = sectionizeText(text);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(validateLesson(result.lesson).errors).toEqual([]);
      for (const section of result.lesson.sections) {
        expect(section.concepts.length).toBeGreaterThan(0);
      }
    });
  }

  it("gives every Concept a sourceQuote that is the learner's own text, unmodified (no fabrication)", () => {
    const result = sectionizeText(RICH_NOTES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const normalizedInput = RICH_NOTES.replace(/\s+/g, " ");
    for (const section of result.lesson.sections) {
      for (const concept of section.concepts) {
        expect(concept.text.includes(concept.sourceQuote)).toBe(true);
        expect(normalizedInput.includes(concept.text)).toBe(true);
      }
    }
  });

  it("is deterministic: the same input produces the same sections (ids differ, text doesn't)", () => {
    const first = sectionizeText(RICH_NOTES);
    const second = sectionizeText(RICH_NOTES);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const shape = (l: typeof first.lesson) => l.sections.map((s) => [s.title, s.concepts.map((c) => c.text)]);
    expect(shape(second.lesson)).toEqual(shape(first.lesson));
  });

  it("returns an error for empty input", () => {
    const result = sectionizeText("   ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.length).toBeGreaterThan(0);
  });

  it("returns an error when there isn't enough content to quiz on", () => {
    expect(sectionizeText("Too short.").ok).toBe(false);
    expect(sectionizeText("One sentence. Two sentences.").ok).toBe(false);
  });
});
