import { alignmentById, alignments, type Alignment } from "./pageLayout.ts";

export type CompileIdentity = {
  author: string;
  pen: string;
  address: string;
  phone: string;
  email: string;
};

export type PageNumbers = "off" | "header" | "footer";

export type CompileSpacing = "single" | "onehalf" | "double";

export type CompileFormat = {
  margins: { top: number; right: number; bottom: number; left: number };
  header: string;
  footer: string;
  pageNumbers: PageNumbers;
  differentFirstPage: boolean;
  font: string;
  points: number;
  spacing: CompileSpacing;
  spaceBefore: number;
  spaceAfter: number;
  indent: number;
  align: Alignment;
  passFont: boolean;
};

export type CompilePreferences = CompileIdentity & CompileFormat;

const storageKey = "manuscriptic-compile";

type PrefStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function defaultCompilePreferences(): CompilePreferences {
  return {
    author: "",
    pen: "",
    address: "",
    phone: "",
    email: "",
    margins: { top: 1, right: 1, bottom: 1, left: 1 },
    header: "{$author} / {$title} / {$page}",
    footer: "",
    pageNumbers: "header",
    differentFirstPage: true,
    font: "Times New Roman",
    points: 12,
    spacing: "double",
    spaceBefore: 0,
    spaceAfter: 0,
    indent: 0.5,
    align: "left",
    passFont: false,
  };
}

export function readCompilePreferences(storage: PrefStorage): CompilePreferences {
  const raw = storage.getItem(storageKey);
  if (raw === null || raw.trim() === "") {
    return defaultCompilePreferences();
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Compile settings could not be read.");
  }
  if (!isRecord(value)) {
    throw new Error("Compile settings could not be read.");
  }
  return compilePreferences(value);
}

export function writeCompilePreferences(storage: PrefStorage, preferences: CompilePreferences): void {
  storage.setItem(storageKey, JSON.stringify(compilePreferences(preferences)));
}

export function compilePreferences(value: unknown): CompilePreferences {
  const fallback = defaultCompilePreferences();
  if (!isRecord(value)) {
    return fallback;
  }
  const margins = isRecord(value.margins) ? value.margins : {};
  return {
    author: text(value.author),
    pen: text(value.pen),
    address: text(value.address),
    phone: text(value.phone),
    email: text(value.email),
    margins: {
      top: inches(margins.top, fallback.margins.top),
      right: inches(margins.right, fallback.margins.right),
      bottom: inches(margins.bottom, fallback.margins.bottom),
      left: inches(margins.left, fallback.margins.left),
    },
    header: typeof value.header === "string" ? value.header : fallback.header,
    footer: text(value.footer),
    pageNumbers: pageNumbers(value.pageNumbers),
    differentFirstPage: value.differentFirstPage !== false,
    font: text(value.font) || fallback.font,
    points: clamp(numberValue(value.points), 8, 72, fallback.points),
    spacing: spacing(value.spacing),
    spaceBefore: clamp(numberValue(value.spaceBefore), 0, 72, fallback.spaceBefore),
    spaceAfter: clamp(numberValue(value.spaceAfter), 0, 72, fallback.spaceAfter),
    indent: clamp(numberValue(value.indent), 0, 2, fallback.indent),
    align: alignments.some((item) => item.id === value.align)
      ? alignmentById(typeof value.align === "string" ? value.align : null)
      : fallback.align,
    passFont: value.passFont === true,
  };
}

function pageNumbers(value: unknown): PageNumbers {
  switch (value) {
    case "off":
    case "header":
    case "footer":
      return value;
    default:
      return "header";
  }
}

function spacing(value: unknown): CompileSpacing {
  switch (value) {
    case "single":
    case "onehalf":
    case "double":
      return value;
    default:
      return "double";
  }
}

function inches(value: unknown, fallback: number): number {
  return clamp(numberValue(value), 0.25, 3, fallback);
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function clamp(value: number | null, min: number, max: number, fallback: number): number {
  if (value === null) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
