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
export const FUN_FACTS: FunFact[] = [
  {
    id: "fact-http-history",
    sectionId: "sample-section-http",
    kind: "history",
    text:
      "HTTP was first introduced in 1991, originally developed at CERN before the IETF and W3C " +
      "took over its standardization -- today's core semantics live in RFC 9110-9113.",
    sourceLabel: "Wikipedia: HTTP",
    sourceUrl: "https://en.wikipedia.org/wiki/Hypertext_Transfer_Protocol",
  },
  {
    id: "fact-http-teapot",
    sectionId: "sample-section-http",
    kind: "trivia",
    text:
      'On April 1, 1998, engineer Larry Masinter published RFC 2324, the "Hyper Text Coffee Pot ' +
      'Control Protocol" -- an April Fools\' joke spec for controlling coffee pots over HTTP that ' +
      'introduced the still-real 418 "I\'m a teapot" status code.',
    sourceLabel: "Wikipedia: Hyper Text Coffee Pot Control Protocol",
    sourceUrl: "https://en.wikipedia.org/wiki/Hyper_Text_Coffee_Pot_Control_Protocol",
  },
  {
    id: "fact-dom-history",
    sectionId: "sample-section-dom",
    kind: "history",
    text:
      'The DOM\'s standardization grew out of the late-1990s "browser wars" between Netscape ' +
      "Navigator and Microsoft Internet Explorer; the W3C published its DOM recommendation in " +
      "2004, and WHATWG now maintains it as a living standard.",
    sourceLabel: "Wikipedia: Document Object Model",
    sourceUrl: "https://en.wikipedia.org/wiki/Document_Object_Model",
  },
  {
    id: "fact-dom-nodes",
    sectionId: "sample-section-dom",
    kind: "trivia",
    text:
      "In the DOM, literally every piece of a document becomes a node: the document itself, each " +
      "element, each attribute, each run of text, and even HTML comments all get their own node " +
      "type in the tree.",
    sourceLabel: "Wikipedia: Document Object Model",
    sourceUrl: "https://en.wikipedia.org/wiki/Document_Object_Model",
  },
  {
    id: "fact-git-history",
    sectionId: "sample-section-git",
    kind: "history",
    text:
      "Git was created by Linus Torvalds in 2005 after the Linux kernel team's relationship with " +
      "the proprietary BitKeeper tool broke down, forcing them to build their own version " +
      "control system in a hurry.",
    sourceLabel: "Git SCM Book: A Short History of Git",
    sourceUrl: "https://git-scm.com/book/en/v2/Getting-Started-A-Short-History-of-Git",
  },
  {
    id: "fact-git-goals",
    sectionId: "sample-section-git",
    kind: "trivia",
    text:
      "Git's original design goals were speed, a simple design, strong support for thousands of " +
      "parallel non-linear branches, and being fully distributed -- no central server required " +
      "for most operations.",
    sourceLabel: "Git SCM Book: A Short History of Git",
    sourceUrl: "https://git-scm.com/book/en/v2/Getting-Started-A-Short-History-of-Git",
  },
  {
    id: "fact-bigo-history",
    sectionId: "sample-section-bigo",
    kind: "history",
    text:
      'Big-O notation traces back to German mathematicians Paul Bachmann and Edmund Landau -- ' +
      'the "O" stands for the German word "Ordnung," meaning order (of approximation), not for ' +
      '"order" in English.',
    sourceLabel: "Wikipedia: Big O notation",
    sourceUrl: "https://en.wikipedia.org/wiki/Big_O_notation",
  },
  {
    id: "fact-bigo-origin",
    sectionId: "sample-section-bigo",
    kind: "trivia",
    text:
      "Big-O notation wasn't invented for computer science at all -- it started in mathematical " +
      "analysis and number theory, for example to bound the error term in the prime number " +
      "theorem, decades before it was borrowed to classify algorithms.",
    sourceLabel: "Wikipedia: Big O notation",
    sourceUrl: "https://en.wikipedia.org/wiki/Big_O_notation",
  },
];

/** All fun facts associated with a given Lesson_Section id, if any. */
export function getFunFactsForSection(sectionId: string): FunFact[] {
  return FUN_FACTS.filter((fact) => fact.sectionId === sectionId);
}
