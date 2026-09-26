import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopNav } from "./TopNav";

describe("TopNav: Astra branding and tab navigation", () => {
  it("renders the Astra brand and all three tabs", () => {
    render(<TopNav activeTab="challenge" onTabChange={vi.fn()} />);
    expect(screen.getByText("Astra")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Daily Challenge" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Lesson" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Study Calendar" })).toBeInTheDocument();
  });

  it("marks the active tab with aria-current", () => {
    render(<TopNav activeTab="add-lesson" onTabChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Add Lesson" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Daily Challenge" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("calls onTabChange with the clicked tab's id", async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    render(<TopNav activeTab="challenge" onTabChange={onTabChange} />);

    await user.click(screen.getByRole("button", { name: "Study Calendar" }));
    expect(onTabChange).toHaveBeenCalledWith("calendar");
  });
});
