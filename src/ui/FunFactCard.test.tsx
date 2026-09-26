import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FunFactCard } from "./FunFactCard";
import type { FunFact } from "../data/funFacts";

describe("FunFactCard", () => {
  it("renders trivia facts under a 'Did You Know?' label", () => {
    const fact: FunFact = {
      id: "f1",
      sectionId: "s1",
      kind: "trivia",
      text: "HTTP/1.1 was standardized in 1997.",
      sourceLabel: "IETF RFC 2068",
      sourceUrl: "https://example.com/rfc2068",
    };
    render(<FunFactCard fact={fact} />);
    expect(screen.getByText("Did You Know?")).toBeInTheDocument();
    expect(screen.getByText(fact.text)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: fact.sourceLabel })).toHaveAttribute(
      "href",
      fact.sourceUrl,
    );
  });

  it("renders history facts under 'A Little History' and without a link when sourceUrl is absent", () => {
    const fact: FunFact = {
      id: "f2",
      sectionId: "s2",
      kind: "history",
      text: "Git was created by Linus Torvalds in 2005.",
      sourceLabel: "Git project history",
    };
    render(<FunFactCard fact={fact} />);
    expect(screen.getByText("A Little History")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === `Source: ${fact.sourceLabel}`),
    ).toBeInTheDocument();
  });
});
