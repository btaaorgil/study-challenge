import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DifficultySelector } from "./DifficultySelector";

describe("DifficultySelector", () => {
  it("marks the current value as pressed and shows its description", () => {
    render(<DifficultySelector value="hard" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Hard" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/pure recall/i)).toBeInTheDocument();
  });

  it("calls onChange with the clicked difficulty", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<DifficultySelector value="normal" onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Easy" }));
    expect(onChange).toHaveBeenCalledWith("easy");
  });
});
