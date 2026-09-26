import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InsightCard } from "./InsightCard";
import { SAMPLE_LESSON } from "../data/sampleLesson";
import type { LessonSection } from "../domain/types";

const customSection: LessonSection = {
  id: "custom-1",
  title: "Photosynthesis",
  explanation: "Photosynthesis turns light into chemical energy inside chloroplasts.",
  concepts: [
    {
      id: "c1",
      text: "Photosynthesis turns light into chemical energy inside chloroplasts.",
      explanation: "From your notes.",
      sourceQuote: "Photosynthesis turns light into chemical energy inside chloroplasts.",
    },
  ],
};

describe("InsightCard: topic insight beside each question", () => {
  it("stays locked before answering on Normal and Hard", () => {
    const { rerender } = render(
      <InsightCard section={SAMPLE_LESSON.sections[0]} difficulty="normal" answered={false} index={0} />,
    );
    expect(screen.getByTestId("insight-locked")).toBeInTheDocument();
    rerender(<InsightCard section={SAMPLE_LESSON.sections[0]} difficulty="hard" answered={false} index={0} />);
    expect(screen.getByText(/no hints on hard/i)).toBeInTheDocument();
  });

  it("shows the cited fact as a hint up front on Easy, and after answering otherwise", () => {
    const { rerender } = render(
      <InsightCard section={SAMPLE_LESSON.sections[0]} difficulty="easy" answered={false} index={0} />,
    );
    expect(screen.getByTestId("fun-fact-card")).toBeInTheDocument();
    rerender(<InsightCard section={SAMPLE_LESSON.sections[0]} difficulty="hard" answered index={1} />);
    expect(screen.getByTestId("fun-fact-card")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", expect.stringMatching(/^https:\/\//));
  });

  it("never invents facts for uploaded lessons: shows key terms and a recap from the notes instead", () => {
    render(<InsightCard section={customSection} difficulty="normal" answered index={0} />);
    expect(screen.queryByTestId("fun-fact-card")).not.toBeInTheDocument();
    expect(screen.getByText(/from your notes/i)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: /key terms/i })).toHaveTextContent(/chloroplasts/i);
  });
});
