// StorageFallbackBanner: renders only when the Storage_Layer has degraded to
// its in-memory fallback (IndexedDB unsupported/blocked/quota-exceeded).
// Dismissible; stays visible until dismissed or the next successful init.
// See design.md: "UI: StorageFallbackBanner". Requirements: 9.3, 9.4.

import { useState } from "react";
import type { StorageStatus } from "../storage/db";

export interface StorageFallbackBannerProps {
  status: StorageStatus;
}

export function StorageFallbackBanner({ status }: StorageFallbackBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (status.kind !== "degraded") {
    // The condition resolved (or never occurred) -- nothing to show.
    // Resets `dismissed` implicitly: if it degrades again later this
    // component remounts fresh state via React's normal re-render, since
    // `dismissed` only matters while status is "degraded".
    return null;
  }

  if (dismissed) {
    return null;
  }

  return (
    <div
      className="storage-fallback-banner"
      role="status"
      aria-live="assertive"
      data-testid="storage-fallback-banner"
    >
      <p>
        Your progress can&apos;t be saved right now ({status.message}). You can keep
        completing today&apos;s challenge, but it won&apos;t be remembered after you
        close this tab.
      </p>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss storage warning"
      >
        Dismiss
      </button>
    </div>
  );
}
