import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopNav } from "./TopNav";
import type { Lesson } from "../domain/types";

const lesson = (id: string, title: string): Lesson => ({ id, title, sections: [] });

function renderNav(overrides: Partial<Parameters<typeof TopNav>[0]> = {}) {
  const props = {
    lessons: [lesson("a", "Biology"), lesson("b", "History")],
    activeLessonId: "a",
    onHome: vi.fn(),
    onSelectLesson: vi.fn(),
    onNewLesson: vi.fn(),
    ...overrides,
  };
  render(<TopNav {...props} />);
  return props;
}

describe("TopNav: Studyy header", () => {
  it("shows the Studyy brand", () => {
    renderNav();
    expect(screen.getByRole("button", { name: /studyy home/i })).toHaveTextContent("Studyy");
  });

  it("switches lessons and starts a new one", async () => {
    const user = userEvent.setup();
    const props = renderNav();
    await user.selectOptions(screen.getByLabelText(/current lesson/i), "b");
    expect(props.onSelectLesson).toHaveBeenCalledWith("b");
    await user.click(screen.getByRole("button", { name: /new lesson/i }));
    expect(props.onNewLesson).toHaveBeenCalledTimes(1);
  });

  it("hides the lesson switcher with a single lesson and all controls in minimal mode", () => {
    renderNav({ lessons: [lesson("a", "Biology")] });
    expect(screen.queryByLabelText(/current lesson/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new lesson/i })).toBeInTheDocument();
  });

  it("renders only the brand in minimal mode (first-run upload screen)", () => {
    renderNav({ minimal: true });
    expect(screen.queryByRole("button", { name: /new lesson/i })).not.toBeInTheDocument();
  });
});
