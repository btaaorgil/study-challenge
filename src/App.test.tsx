import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import App from "./App";
import { createStorageLayer } from "./storage/db";
import { SAMPLE_LESSON } from "./data/sampleLesson";

let dbCounter = 0;
function freshApp() {
  dbCounter += 1;
  const { storage, getStatus } = createStorageLayer(new IDBFactory(), `app-test-${dbCounter}`);
  render(<App storage={storage} getStorageStatus={getStatus} />);
  return storage;
}

const NOTES = `## Photosynthesis
Photosynthesis is the process plants use to turn light into chemical energy. It takes place in the chloroplasts of leaf cells. Chlorophyll absorbs red and blue light.

## French Revolution
The French Revolution began in 1789 at Versailles. King Louis XVI faced a financial crisis. The storming of the Bastille happened on 14 July.`;

describe("App: upload-first flow", () => {
  it("opens on the upload screen when no lesson has been chosen yet", async () => {
    freshApp();
    expect(await screen.findByText(/welcome to studyy/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /turn into quizzes/i })).toBeInTheDocument();
    expect(screen.queryByText(/daily challenge/i)).not.toBeInTheDocument();
  });

  it(
    "turns pasted notes into a dashboard with one card per topic, and remembers it on reload",
    async () => {
      const user = userEvent.setup();
      const storage = freshApp();

      fireEvent.change(await screen.findByLabelText(/lesson notes/i), { target: { value: NOTES } });
      await user.click(screen.getByRole("button", { name: /turn into quizzes/i }));
      await user.click(await screen.findByRole("button", { name: /start studying/i }, { timeout: 4000 }));

      const heading = await screen.findByRole("heading", { name: /topics in this lesson/i });
      const grid = heading.parentElement!.querySelector(".topic-grid")!;
      expect(within(grid as HTMLElement).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
        "Photosynthesis",
        "French Revolution",
      ]);
      expect(screen.getByText(/2 topics/i)).toBeInTheDocument();

      // The choice persisted, so a fresh App on the same storage goes straight to the dashboard.
      const active = await storage.getActiveLessonId();
      expect(active).toBeDefined();
    },
    15000,
  );

  it(
    "offers the sample lesson, then Daily Challenge and Test Yourself are both available right away",
    async () => {
      const user = userEvent.setup();
      freshApp();

      await user.click(await screen.findByRole("button", { name: /try the sample lesson/i }));
      expect(await screen.findByRole("heading", { name: SAMPLE_LESSON.title })).toBeInTheDocument();

      // Test Yourself doesn't require finishing the daily challenge first.
      await user.click(screen.getByRole("button", { name: /test yourself/i }));
      expect(await screen.findByText(/question 1 of 13/i)).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: /quit exam/i }));
      await user.click(await screen.findByRole("button", { name: /daily challenge/i }));
      expect(await screen.findByText(/question 1 of 5/i)).toBeInTheDocument();
    },
    15000,
  );

  it(
    "applies the chosen difficulty to the questions (Easy = 3 options)",
    async () => {
      const user = userEvent.setup();
      freshApp();

      await user.click(await screen.findByRole("button", { name: /try the sample lesson/i }));
      await user.click(await screen.findByRole("button", { name: "Easy" }));
      expect(screen.getByRole("button", { name: "Easy" })).toHaveAttribute("aria-pressed", "true");

      await user.click(screen.getByRole("button", { name: /daily challenge/i }));
      await screen.findByText(/question 1 of 5/i);
      expect(screen.getAllByRole("radio")).toHaveLength(3);
    },
    15000,
  );
});
