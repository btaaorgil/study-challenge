import { describe, expect, it } from "vitest";

// Trivial smoke test confirming the Vitest + TypeScript harness runs.
// See tasks.md 1.2 and design.md Testing Strategy.
describe("test harness smoke test", () => {
  it("runs a basic assertion", () => {
    expect(1 + 1).toBe(2);
  });

  it("has fake-indexeddb's global indexedDB available", () => {
    expect(typeof indexedDB).toBe("object");
  });
});
