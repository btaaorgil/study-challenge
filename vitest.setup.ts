// Installs fake-indexeddb's global indexedDB implementation for tests,
// so the Storage_Layer (src/storage/db.ts) can be tested without a real browser.
// See design.md: Tech Stack / Testing Strategy.
import "fake-indexeddb/auto";
