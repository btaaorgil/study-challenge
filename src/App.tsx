import { useEffect, useState } from "react";
import { ChallengeView } from "./ui/ChallengeView";
import { storage, getStorageStatus } from "./storage/db";
import { selectActiveLesson } from "./domain/lesson";
import { SAMPLE_LESSON } from "./data/sampleLesson";
import type { Lesson } from "./domain/types";

function App() {
  const [lesson, setLesson] = useState<Lesson | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      // storage.init() opens IndexedDB (or degrades gracefully) and seeds
      // SAMPLE_LESSON if no other lesson qualifies (Req 2.1, 2.3).
      await storage.init();
      const storedLessons = await storage.listLessons();
      const activeLesson = selectActiveLesson(storedLessons, SAMPLE_LESSON);
      if (!cancelled) {
        setLesson(activeLesson);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!lesson) {
    return (
      <main>
        <p role="status">Loading&hellip;</p>
      </main>
    );
  }

  return (
    <ChallengeView lesson={lesson} storage={storage} getStorageStatus={getStorageStatus} />
  );
}

export default App;
