// ProgressBar: "Question X of Y" label with a visual progress track, used by
// the one-by-one question flow (Daily Challenge and Final Exam).

export interface ProgressBarProps {
  current: number; // 1-based
  total: number;
  label?: string;
}

export function ProgressBar({ current, total, label }: ProgressBarProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="progress-header" role="group" aria-label="Progress">
      <span className="progress-label">
        {label ?? "Question"} {current} of {total}
      </span>
      <div
        className="progress-track"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={1}
        aria-valuemax={total}
      >
        <div className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
