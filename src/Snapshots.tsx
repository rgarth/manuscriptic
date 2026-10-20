import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import {
  snapshotMinuteChoices,
  writeSnapshotMinutes,
  type SnapshotMinutes,
} from "./filePrefs";
import { failureMessage, reportFailure } from "./failures";

export type SnapshotListItem = {
  id: string;
  at: number;
  kind: "manual" | "auto";
};

type SnapshotsProps = {
  snapshotMinutes: SnapshotMinutes;
  snapshots: SnapshotListItem[];
  onSnapshotMinutes: (minutes: SnapshotMinutes) => void;
  onTakeSnapshot: () => void;
  onRestoreBook: (id: string) => void;
  onRestoreScene: (id: string) => void;
  onDeleteSnapshot: (id: string) => void;
  onClose: () => void;
};

export default function Snapshots({
  snapshotMinutes,
  snapshots,
  onSnapshotMinutes,
  onTakeSnapshot,
  onRestoreBook,
  onRestoreScene,
  onDeleteSnapshot,
  onClose,
}: SnapshotsProps) {
  const ordered = [...snapshots].sort((left, right) => right.at - left.at);
  const newestId = ordered[0]?.id ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(newestId);
  const [error, setError] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const previousNewest = useRef(newestId);
  const selected = ordered.find((snapshot) => snapshot.id === selectedId) ?? ordered[0] ?? null;
  const selectedStamp = selected ? snapshotStamp(selected.at, Date.now()) : null;

  useEffect(() => {
    if (newestId && newestId !== previousNewest.current) {
      setSelectedId(newestId);
    }
    previousNewest.current = newestId;
  }, [newestId]);

  useEffect(() => {
    const card = strip.current?.querySelector<HTMLElement>("[aria-selected='true']");
    if (!card || !strip.current) {
      return;
    }
    const stripRect = strip.current.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    if (cardRect.left < stripRect.left) {
      strip.current.scrollLeft -= stripRect.left - cardRect.left;
    } else if (cardRect.right > stripRect.right) {
      strip.current.scrollLeft += cardRect.right - stripRect.right;
    }
    if (strip.current.contains(document.activeElement)) {
      card.focus();
    }
  }, [selected?.id]);

  function chooseMinutes(minutes: SnapshotMinutes) {
    try {
      writeSnapshotMinutes(localStorage, minutes);
      setError(null);
      onSnapshotMinutes(minutes);
    } catch (caught: unknown) {
      const message = failureMessage(caught, "Could not save this preference.");
      setError(message);
      reportFailure(message, message);
    }
  }

  function onStripKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!selected) {
      return;
    }
    const index = ordered.findIndex((snapshot) => snapshot.id === selected.id);
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        setSelectedId(ordered[Math.min(ordered.length - 1, index + 1)]?.id ?? selected.id);
        return;
      case "ArrowLeft":
        event.preventDefault();
        setSelectedId(ordered[Math.max(0, index - 1)]?.id ?? selected.id);
        return;
      default:
        return;
    }
  }

  return (
    <section className="snapshot-shelf" aria-label="Snapshots">
      <div className="snapshot-bar">
        <div>
          <h2>Snapshots</h2>
          <p>A manual snapshot stays. Automatic ones thin out as they age.</p>
        </div>
        <div className="snapshot-controls">
          <div className="segmented" role="group" aria-label="Automatic snapshot interval">
            {snapshotMinuteChoices.map((minutes) => (
              <button
                key={minutes}
                type="button"
                aria-pressed={minutes === snapshotMinutes}
                onClick={() => chooseMinutes(minutes)}
              >
                {snapshotLabel(minutes)}
              </button>
            ))}
          </div>
          <button type="button" className="snapshot-take" onClick={onTakeSnapshot}>
            Take snapshot
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {ordered.length === 0 ? (
        <p className="snapshot-empty">No snapshots yet. Take one before a rewrite.</p>
      ) : (
        <div
          className="snapshot-strip"
          role="listbox"
          aria-label="Snapshots"
          aria-orientation="horizontal"
          tabIndex={0}
          ref={strip}
          onKeyDown={onStripKey}
        >
          {ordered.map((snapshot) => {
            const stamp = snapshotStamp(snapshot.at, Date.now());
            const chosen = snapshot.id === selected?.id;
            return (
              <button
                key={snapshot.id}
                type="button"
                role="option"
                aria-selected={chosen}
                className={chosen ? "snapshot-card selected" : "snapshot-card"}
                onClick={() => setSelectedId(snapshot.id)}
              >
                <span className="snapshot-when">{stamp.time}</span>
                <span className="snapshot-day">{stamp.day}</span>
                <span className="snapshot-kind">{kindLabel(snapshot.kind)}</span>
              </button>
            );
          })}
        </div>
      )}
      {selected ? (
        <div className="snapshot-actions">
          <p>
            {selectedStamp?.day} · {selectedStamp?.time} · {kindLabel(selected.kind)}
          </p>
          <button type="button" onClick={() => onRestoreScene(selected.id)}>
            Restore this scene
          </button>
          <button type="button" onClick={() => onRestoreBook(selected.id)}>
            Restore the book
          </button>
          <button type="button" onClick={() => onDeleteSnapshot(selected.id)}>
            Delete
          </button>
        </div>
      ) : null}
    </section>
  );
}

function kindLabel(kind: SnapshotListItem["kind"]): string {
  switch (kind) {
    case "manual":
      return "Manual";
    case "auto":
      return "Automatic";
    default: {
      const unexpected: never = kind;
      return unexpected;
    }
  }
}

function snapshotLabel(minutes: SnapshotMinutes): string {
  switch (minutes) {
    case 0:
      return "Off";
    case 5:
      return "5 min";
    case 15:
      return "15 min";
    case 60:
      return "Hour";
    default: {
      const unexpected: never = minutes;
      return unexpected;
    }
  }
}

function snapshotStamp(at: number, now: number): { time: string; day: string } {
  const moment = new Date(at);
  const time = moment.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = Math.round((startOfDay(now) - startOfDay(at)) / 86_400_000);
  if (days <= 0) {
    return { time, day: "Today" };
  }
  if (days === 1) {
    return { time, day: "Yesterday" };
  }
  if (days < 7) {
    return { time, day: moment.toLocaleDateString(undefined, { weekday: "long" }) };
  }
  return {
    time: moment.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    day: moment.toLocaleDateString(undefined, { year: "numeric" }),
  };
}

function startOfDay(at: number): number {
  const date = new Date(at);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
