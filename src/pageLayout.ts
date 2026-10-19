export const defaultFont = "EB Garamond";

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

const garamondFamily =
  '"EB Garamond Variable", "EB Garamond", Palatino, "Palatino Linotype", serif';
const defaultPoints = 12;

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

export function displayPixels(points: number, zoom: number): number {
  return ((points * 96) / 72) * (zoom / 100);
}

export function alignmentById(id: string | null): Alignment {
  return alignments.find((item) => item.id === id)?.id ?? "justify";
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
