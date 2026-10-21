import { reportFailure } from "./failures.ts";

export const paragraphIndents = [
  { id: "none", label: "None" },
  { id: "first", label: "First line" },
] as const;

export type ParagraphIndent = (typeof paragraphIndents)[number]["id"];

export const lineSpacings = [
  { id: "single", label: "Single" },
  { id: "onehalf", label: "1.5" },
  { id: "comfortable", label: "Comfortable" },
  { id: "double", label: "Double" },
] as const;

export type LineSpacing = (typeof lineSpacings)[number]["id"];

export type EditorPrefs = {
  zoom: number;
  typewriter: boolean;
  indent: ParagraphIndent;
  spacing: LineSpacing;
};

const zoomKey = "manuscriptic-editor-zoom";
const typewriterKey = "manuscriptic-typewriter";
const indentKey = "manuscriptic-paragraph-indent";
const spacingKey = "manuscriptic-line-spacing";
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

export function paragraphIndent(id: string | null): ParagraphIndent {
  return paragraphIndents.find((item) => item.id === id)?.id ?? "first";
}

export function lineSpacing(id: string | null): LineSpacing {
  return lineSpacings.find((item) => item.id === id)?.id ?? "comfortable";
}

export function indentEm(indent: ParagraphIndent): string {
  switch (indent) {
    case "none":
      return "0";
    case "first":
      return "1.5em";
    default: {
      const unexpected: never = indent;
      return unexpected;
    }
  }
}

export function spacingLine(spacing: LineSpacing): string {
  switch (spacing) {
    case "single":
      return "1.15";
    case "onehalf":
      return "1.5";
    case "comfortable":
      return "1.7";
    case "double":
      return "2";
    default: {
      const unexpected: never = spacing;
      return unexpected;
    }
  }
}

export function paragraphGap(indent: ParagraphIndent): string {
  switch (indent) {
    case "none":
      return "0.9em";
    case "first":
      return "0";
    default: {
      const unexpected: never = indent;
      return unexpected;
    }
  }
}

let zoom = zoomPercent(readSaved(zoomKey));
let typewriter = readSaved(typewriterKey) === "true";
let indent = paragraphIndent(readSaved(indentKey));
let spacing = lineSpacing(readSaved(spacingKey));
let snapshot: EditorPrefs = { zoom, typewriter, indent, spacing };
const listeners = new Set<() => void>();

function publish() {
  snapshot = { zoom, typewriter, indent, spacing };
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

export function setTypewriter(on: boolean) {
  if (on === typewriter || !writeSaved(typewriterKey, on ? "true" : "false")) {
    return;
  }
  typewriter = on;
  publish();
}

export function setIndent(value: ParagraphIndent) {
  if (value === indent || !writeSaved(indentKey, value)) {
    return;
  }
  indent = value;
  publish();
}

export function setSpacing(value: LineSpacing) {
  if (value === spacing || !writeSaved(spacingKey, value)) {
    return;
  }
  spacing = value;
  publish();
}
