import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Requirement 9.2: THE System SHALL route all reads and writes of Lessons,
// Daily_Challenges, and Attempts through the Storage_Layer. This grep-based
// test asserts no module other than src/storage/db.ts references the global
// `indexedDB`, which would bypass that single access point.

const SRC_ROOT = join(__dirname, "..");
const ALLOWED_FILE = join(__dirname, "db.ts");
const INDEXED_DB_REFERENCE = /\bindexedDB\b/;
const TEST_FILE_PATTERN = /\.(test|property\.test)\.tsx?$/;

function collectSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("Storage_Layer is the sole IndexedDB access point (Requirement 9.2)", () => {
  it("has no reference to the global indexedDB outside db.ts (excluding test files)", () => {
    const allFiles = collectSourceFiles(SRC_ROOT);
    const offendingFiles: string[] = [];

    for (const file of allFiles) {
      if (file === ALLOWED_FILE) continue;
      if (TEST_FILE_PATTERN.test(file)) continue; // tests legitimately reference fake-indexeddb

      const content = readFileSync(file, "utf-8");
      if (INDEXED_DB_REFERENCE.test(content)) {
        offendingFiles.push(relative(SRC_ROOT, file));
      }
    }

    expect(offendingFiles).toEqual([]);
  });
});
