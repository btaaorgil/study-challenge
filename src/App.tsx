import { useEffect, useState } from "react";
import { ChallengeView } from "./ui/ChallengeView";
import { AddLessonView } from "./ui/AddLessonView";
import { StudyCalendarView } from "./ui/StudyCalendarView";
import { TopNav, type AppTab } from "./ui/TopNav";
import { storage, getStorageStatus } from "./storage/db";
import { resolveActiveLesson } from "./domain/lesson";
import { SAMPLE_LESSON } from "./data/sampleLesson";
import type { Lesson } from "./domain/types";

function App() {
  const [lesson, setLesson] = useState<Lesson | undefined>(undefined);
  const [tab, setTab] = useState<AppTab>("challenge");

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      // storage.init() opens IndexedDB (or degrades gracefully) and seeds
      // SAMPLE_LESSON if no other lesson qualifies (Req 2.1, 2.3).
      await storage.init();
      const storedLessons = await storage.listLessons();
      const activeLessonId = await storage.getActiveLessonId();
      const activeLesson = resolveActiveLesson(storedLessons, SAMPLE_LESSON, activeLessonId);
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
      <div className="page">
        <main className="app-shell">
          <p className="loading-state" role="status">
            Loading&hellip;
          </p>
        </main>
      </div>
    );
  }

  return (
    <>
      <TopNav activeTab={tab} onTabChange={setTab} />
      {tab === "challenge" && (
        <ChallengeView lesson={lesson} storage={storage} getStorageStatus={getStorageStatus} />
      )}
      {tab === "add-lesson" && (
        <AddLessonView
          storage={storage}
          onLessonImported={(imported) => {
            setLesson(imported);
            setTab("challenge");
          }}
        />
      )}
      {tab === "calendar" && <StudyCalendarView storage={storage} />}
    </>
  );
}

export default App;
