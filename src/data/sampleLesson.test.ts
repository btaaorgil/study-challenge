import { describe, expect, it } from "vitest";
import { SAMPLE_LESSON } from "./sampleLesson";
import { validateLesson } from "../domain/lesson";

describe("SAMPLE_LESSON structural validity (Requirement 2.4)", () => {
  it("passes validateLesson with no errors", () => {
    const result = validateLesson(SAMPLE_LESSON);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("has exactly 4 sections, each with at least one concept", () => {
    expect(SAMPLE_LESSON.sections).toHaveLength(4);
    for (const section of SAMPLE_LESSON.sections) {
      expect(section.concepts.length).toBeGreaterThanOrEqual(1);
      expect(section.concepts.length).toBeLessThanOrEqual(20);
    }
  });

  it("gives every concept a sourceQuote that is an exact substring of its own text", () => {
    for (const section of SAMPLE_LESSON.sections) {
      for (const concept of section.concepts) {
        expect(concept.text.includes(concept.sourceQuote)).toBe(true);
        expect(concept.explanation.trim().length).toBeGreaterThan(0);
        expect(concept.sourceQuote.trim().length).toBeGreaterThan(0);
      }
    }
  });
});
