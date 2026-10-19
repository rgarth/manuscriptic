import { reportFailure } from "./failures.ts";

export type EditorPrefs = {
  zoom: number;
};

const zoomKey = "manuscriptic-editor-zoom";
const defaultZoom = 112.5;

export const zoomStops = [75, 100, 112.5, 125, 150, 175, 200] as const;

export function zoomPercent(value: string | number | null): number {
  if (value === null || value === "") {
    return defaultZoom;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultZoom;
  }
  return Math.min(200, Math.max(75, Math.round(parsed * 2) / 2));
}

export function nextZoom(current: number, direction: "in" | "out"): number {
  switch (direction) {
    case "in":
      return zoomStops.find((stop) => stop > current + 0.01) ?? zoomStops[zoomStops.length - 1];
    case "out": {
      const lower = [...zoomStops].reverse().find((stop) => stop < current - 0.01);
      return lower ?? zoomStops[0];
    }
    default: {
      const unexpected: never = direction;
      return unexpected;
    }
  }
}

let reportedReadFailure = false;

function readSaved(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error: unknown) {
    if (!reportedReadFailure) {
      reportedReadFailure = true;
      reportFailure(error, "Saved preferences could not be read.");
    }
    return null;
  }
}

function writeSaved(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error: unknown) {
    reportFailure(error, "Could not save this preference.");
    return false;
  }
}

let zoom = zoomPercent(readSaved(zoomKey));
let snapshot: EditorPrefs = { zoom };
const listeners = new Set<() => void>();

function publish() {
  snapshot = { zoom };
  for (const listener of listeners) {
    listener();
  }
}

export function getEditorPrefs(): EditorPrefs {
  return snapshot;
}

export function subscribeEditorPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setZoom(value: string | number) {
  const next = zoomPercent(value);
  if (next === zoom || !writeSaved(zoomKey, String(next))) {
    return;
  }
  zoom = next;
  publish();
}
