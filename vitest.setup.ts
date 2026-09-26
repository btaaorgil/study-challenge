// Installs fake-indexeddb's global indexedDB implementation for tests,
// so the Storage_Layer (src/storage/db.ts) can be tested without a real browser.
// See design.md: Tech Stack / Testing Strategy.
import "fake-indexeddb/auto";

// Adds jest-dom's DOM-specific matchers (toBeDisabled, toHaveTextContent, etc.)
// for UI component tests (src/ui/*.test.tsx).
import "@testing-library/jest-dom/vitest";

// React Testing Library auto-cleans up mounted components after each test.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
afterEach(() => {
  cleanup();
});
