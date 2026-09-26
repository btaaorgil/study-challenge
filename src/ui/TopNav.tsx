// TopNav: sticky header with Study Challenge branding and primary navigation tabs.

export type AppTab = "challenge" | "add-lesson" | "calendar";

export interface TopNavProps {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const TABS: Array<{ id: AppTab; label: string }> = [
  { id: "challenge", label: "Daily Challenge" },
  { id: "add-lesson", label: "Add Lesson" },
];

export function TopNav({ activeTab, onTabChange }: TopNavProps) {
  return (
    <header className="top-nav">
      <div className="top-nav-inner">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true">
            S
          </span>
          Study Challenge
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
