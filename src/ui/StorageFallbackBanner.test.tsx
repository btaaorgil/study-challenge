import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StorageFallbackBanner } from "./StorageFallbackBanner";
import type { StorageStatus } from "../storage/db";

describe("StorageFallbackBanner (Requirements 9.3, 9.4)", () => {
  it("does not render when storage status is ok", () => {
    render(<StorageFallbackBanner status={{ kind: "ok" }} />);
    expect(screen.queryByTestId("storage-fallback-banner")).not.toBeInTheDocument();
  });

  it("renders when storage status is degraded, for each degraded reason", () => {
    const reasons: Array<StorageStatus & { kind: "degraded" }> = [
      { kind: "degraded", reason: "unsupported", message: "no IndexedDB" },
      { kind: "degraded", reason: "blocked", message: "blocked by another tab" },
      { kind: "degraded", reason: "quota-exceeded", message: "storage full" },
    ];

    for (const status of reasons) {
      const { unmount } = render(<StorageFallbackBanner status={status} />);
      const banner = screen.getByTestId("storage-fallback-banner");
      expect(banner).toBeInTheDocument();
      expect(banner).toHaveTextContent(status.message);
      unmount();
    }
  });

  it("remains visible until the user dismisses it", async () => {
    const user = userEvent.setup();
    render(
      <StorageFallbackBanner
        status={{ kind: "degraded", reason: "blocked", message: "blocked by another tab" }}
      />,
    );

    expect(screen.getByTestId("storage-fallback-banner")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(screen.queryByTestId("storage-fallback-banner")).not.toBeInTheDocument();
  });

  it("disappears once the condition resolves back to ok (without dismissal)", () => {
    const { rerender } = render(
      <StorageFallbackBanner
        status={{ kind: "degraded", reason: "blocked", message: "blocked by another tab" }}
      />,
    );
    expect(screen.getByTestId("storage-fallback-banner")).toBeInTheDocument();

    rerender(<StorageFallbackBanner status={{ kind: "ok" }} />);
    expect(screen.queryByTestId("storage-fallback-banner")).not.toBeInTheDocument();
  });
});
