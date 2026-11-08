export const defaultFont = "Times New Roman";

export const alignments = [
  { id: "left", label: "Align Left" },
  { id: "center", label: "Center" },
  { id: "right", label: "Align Right" },
  { id: "justify", label: "Justified" },
] as const;

export type Alignment = (typeof alignments)[number]["id"];

export type PageLayout = {
  font: string;
  points: number;
  align: Alignment;
};

const defaultPoints = 12;

export function fontName(id: string | null): string {
  if (!id || !id.trim() || id === "garamond" || id === "literata" || id === "baskerville") {
    return defaultFont;
  }
  return id.trim();
}

export function fontFamily(name: string): string {
  const chosen = fontName(name);
  const quoted = `"${chosen.replace(/"/g, "")}"`;
  const fallback = chosen === defaultFont ? "Times, serif" : `"${defaultFont}", Times, serif`;
  return `${quoted}, ${fallback}`;
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

export function pointScale(zoom: number): number {
  return (96 / 72) * (zoom / 100);
}

export function displayPixels(points: number, zoom: number): number {
  return points * pointScale(zoom);
}

export function fontSizePoints(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const match = /^(\d+(?:\.\d+)?)(pt|px)$/.exec(value.trim());
  const amount = match?.[1];
  const unit = match?.[2];
  if (!amount || (unit !== "pt" && unit !== "px")) {
    return null;
  }
  const parsed = Number(amount);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return pointSize(unit === "px" ? (parsed * 72) / 96 : parsed);
}

export function fontSizeText(points: number): string {
  return `${pointSize(points)}pt`;
}

export function alignmentById(id: string | null): Alignment {
  return alignments.find((item) => item.id === id)?.id ?? "justify";
}

export function alignmentOrNull(id: unknown): Alignment | null {
  if (typeof id !== "string") {
    return null;
  }
  return alignments.find((item) => item.id === id)?.id ?? null;
}

export function defaultPageLayout(): PageLayout {
  return { font: defaultFont, points: defaultPoints, align: "justify" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function pageLayout(value: unknown): PageLayout {
  if (!isRecord(value)) {
    return defaultPageLayout();
  }
  return {
    font: fontName(typeof value.font === "string" ? value.font : null),
    points: pointSize(
      typeof value.points === "number" || typeof value.points === "string" ? value.points : null,
    ),
    align: alignmentById(typeof value.align === "string" ? value.align : null),
  };
}
