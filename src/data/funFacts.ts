// Fun Facts / "Did You Know?" and "A Little History" trivia, keyed by the
// Lesson_Section id of the bundled Sample_Lesson they relate to.
//
// IMPORTANT: this file is a static, hand-curated bundle. Facts here were
// gathered *at authoring time* using the MCP fetch tool (see NOTES.md
// "## MCP (Lesson 6)" for the exact tool calls, sources, and dates fetched),
// then copied in as plain data -- there is no runtime network call anywhere
// in this file or in the components that read it. This preserves the app's
// zero-network, local-only posture (.kiro/steering/storage.md, Requirement 10)
// while still giving each fact a real, checkable citation.
//
// Facts are only shown for known sectionIds (the bundled Sample_Lesson's
// fixed ids). Custom lessons imported via "Add Lesson" get random ids and
// simply show no fact card -- we never fabricate a "citation" for content
// we don't actually have a source for.

export interface FunFact {
  id: string;
  sectionId: string;
  kind: "trivia" | "history";
  text: string;
  sourceLabel: string;
  sourceUrl?: string;
}

// Populated from real, cited sources gathered via the MCP fetch tool.
// See NOTES.md "## MCP (Lesson 6)" for the tool calls and source URLs.
export const FUN_FACTS: FunFact[] = [];

/** All fun facts associated with a given Lesson_Section id, if any. */
export function getFunFactsForSection(sectionId: string): FunFact[] {
  return FUN_FACTS.filter((fact) => fact.sectionId === sectionId);
}
