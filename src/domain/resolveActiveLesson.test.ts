import { describe, expect, it } from "vitest";
import { resolveActiveLesson } from "./lesson";
import type { Lesson } from "./types";

const sampleLesson: Lesson = {
  id: "sample-lesson",
  title: "Sample Lesson",
  sections: [
    { id: "s1", title: "S1", explanation: "E1", concepts: [{ id: "c1", text: "t", explanation: "e", sourceQuote: "t" }] },
    { id: "s2", title: "S2", explanation: "E2", concepts: [{ id: "c2", text: "t", explanation: "e", sourceQuote: "t" }] },
    { id: "s3", title: "S3", explanation: "E3", concepts: [{ id: "c3", text: "t", explanation: "e", sourceQuote: "t" }] },
    { id: "s4", title: "S4", explanation: "E4", concepts: [{ id: "c4", text: "t", explanation: "e", sourceQuote: "t" }] },
  ],
};

const importedLesson: Lesson = { ...sampleLesson, id: "imported-lesson", title: "Imported" };
const otherLesson: Lesson = { ...sampleLesson, id: "other-lesson", title: "Other" };

describe("resolveActiveLesson: active-lesson-id pointer takes priority", () => {
  it("returns the pointed-to lesson when it exists and validates", () => {
    const result = resolveActiveLesson(
      [otherLesson, importedLesson],
      sampleLesson,
      importedLesson.id,
    );
    expect(result).toBe(importedLesson);
  });

  it("falls back to selectActiveLesson's normal rule when no activeLessonId is given", () => {
    const result = resolveActiveLesson([importedLesson], sampleLesson, undefined);
    expect(result).toBe(importedLesson);
  });

  it("falls back to selectActiveLesson's normal rule when the pointed-to lesson no longer exists", () => {
    const result = resolveActiveLesson([otherLesson], sampleLesson, "deleted-lesson-id");
    expect(result).toBe(otherLesson);
  });

  it("falls back when the pointed-to lesson exists but no longer validates", () => {
    const invalidImported: Lesson = { id: importedLesson.id, title: "Broken", sections: [] };
    const result = resolveActiveLesson(
      [invalidImported, otherLesson],
      sampleLesson,
      importedLesson.id,
    );
    expect(result).toBe(otherLesson);
  });

  it("falls back to the Sample_Lesson when the pointer is set but nothing else qualifies", () => {
    const result = resolveActiveLesson([], sampleLesson, "nonexistent-id");
    expect(result).toBe(sampleLesson);
  });
});
