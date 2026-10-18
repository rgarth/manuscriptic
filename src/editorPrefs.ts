export const defaultFont = "EB Garamond";

export const alignments = [
  { id: "left", label: "Align Left" },
  { id: "center", label: "Center" },
  { id: "right", label: "Align Right" },
  { id: "justify", label: "Justified" },
] as const;

export type Alignment = (typeof alignments)[number]["id"];

export type EditorPrefs = {
  font: string;
  points: number;
  zoom: number;
  align: Alignment;
};

const garamondFamily =
  '"EB Garamond Variable", "EB Garamond", Palatino, "Palatino Linotype", serif';
const fontKey = "manuscriptic-editor-font";
const pointsKey = "manuscriptic-editor-points";
const zoomKey = "manuscriptic-editor-zoom";
const alignKey = "manuscriptic-editor-align";
const defaultPoints = 12;
const defaultZoom = 112.5;

export const zoomStops = [75, 100, 112.5, 125, 150, 175, 200] as const;

export function fontName(id: string | null): string {
  if (!id || !id.trim() || id === "garamond" || id === "literata" || id === "baskerville") {
    return defaultFont;
  }
  return id.trim();
}

export function fontFamily(name: string): string {
  const chosen = fontName(name);
  if (chosen === defaultFont) {
    return garamondFamily;
  }
  return `"${chosen.replace(/"/g, "")}", ${garamondFamily}`;
}

export function pointSize(value: string | number | null): number {
  if (value === null || value === "") {
    return defaultPoints;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultPoints;
  }
  return Math.min(72, Math.max(8, Math.round(parsed)));
}

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

export function displayPixels(points: number, zoom: number): number {
  return ((points * 96) / 72) * (zoom / 100);
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

export function alignmentById(id: string | null): Alignment {
  return alignments.find((item) => item.id === id)?.id ?? "justify";
}

function readSaved(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeSaved(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

let font = fontName(readSaved(fontKey));
let points = pointSize(readSaved(pointsKey));
let zoom = zoomPercent(readSaved(zoomKey));
let align = alignmentById(readSaved(alignKey));
let snapshot: EditorPrefs = { font, points, zoom, align };
const listeners = new Set<() => void>();

function publish() {
  snapshot = { font, points, zoom, align };
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

export function setEditorFont(id: string) {
  const next = fontName(id);
  if (next === font) {
    return;
  }
  font = next;
  writeSaved(fontKey, font);
  publish();
}

export function setPointSize(value: string | number) {
  const next = pointSize(value);
  if (next === points) {
    return;
  }
  points = next;
  writeSaved(pointsKey, String(points));
  publish();
}

export function setZoom(value: string | number) {
  const next = zoomPercent(value);
  if (next === zoom) {
    return;
  }
  zoom = next;
  writeSaved(zoomKey, String(zoom));
  publish();
}

export function setAlignment(id: string) {
  const next = alignmentById(id);
  if (next === align) {
    return;
  }
  align = next;
  writeSaved(alignKey, align);
  publish();
}
