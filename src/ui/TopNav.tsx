// TopNav: sticky header with Astra branding and primary navigation tabs.
// Purely presentational routing (tab state lives in App.tsx) -- no router
// dependency needed for a 3-tab app.

export type AppTab = "challenge" | "add-lesson" | "calendar";

export interface TopNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const TABS: Array<{ id: AppTab; label: string }> = [
  { id: "challenge", label: "Daily Challenge" },
  { id: "add-lesson", label: "Add Lesson" },
  { id: "calendar", label: "Study Calendar" },
];

export function TopNav({ activeTab, onTabChange }: TopNavProps) {
  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            A
          </span>
          Astra
        </span>
        <nav className="nav-tabs" aria-label="Primary">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className="nav-tab"
              aria-current={activeTab === tab.id ? "page" : undefined}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}
