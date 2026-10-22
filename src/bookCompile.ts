import { alignmentById, alignments, type Alignment } from "./pageLayout.ts";

export const chapterHeadings = ["title", "number", "numberTitle", "word", "written"] as const;
export type ChapterHeading = (typeof chapterHeadings)[number];

export const levelHeadings = ["none", ...chapterHeadings] as const;
export type LevelHeading = (typeof levelHeadings)[number];

export type CompileLevel = {
  include: boolean;
  name: string;
  heading: LevelHeading;
};

export const sceneBreaks = ["hash", "stars", "blank"] as const;
export type SceneBreak = (typeof sceneBreaks)[number];

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

export type BookCompile = {
  levels: CompileLevel[];
  sceneTitles: boolean;
  sceneBreak: SceneBreak;
  titleOnly: string[];
  useAppAuthor: boolean;
  author: CompileIdentity;
  format: CompileFormat;
};

export function defaultCompileIdentity(): CompileIdentity {
  return { author: "", pen: "", address: "", phone: "", email: "" };
}

export function defaultCompileFormat(): CompileFormat {
  return {
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

export function defaultCompilePreferences(): CompilePreferences {
  return { ...defaultCompileIdentity(), ...defaultCompileFormat() };
}

export function defaultBookCompile(): BookCompile {
  return bookCompile({
    levels: [
      { include: false, name: "", heading: "none" },
      { include: true, name: "Chapter", heading: "title" },
    ],
    sceneTitles: false,
    sceneBreak: "hash",
    titleOnly: [],
    useAppAuthor: true,
    author: defaultCompileIdentity(),
    format: defaultCompileFormat(),
  });
}

export function resolvedCompilePreferences(book: BookCompile, app: CompileIdentity): CompilePreferences {
  return { ...(book.useAppAuthor ? app : book.author), ...book.format };
}

export function compileIdentity(value: unknown): CompileIdentity {
  if (!isRecord(value)) {
    return defaultCompileIdentity();
  }
  return {
    author: text(value.author),
    pen: text(value.pen),
    address: text(value.address),
    phone: text(value.phone),
    email: text(value.email),
  };
}

export function compileFormat(value: unknown): CompileFormat {
  const fallback = defaultCompileFormat();
  if (!isRecord(value)) {
    return fallback;
  }
  const margins = isRecord(value.margins) ? value.margins : {};
  return {
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

export function bookCompile(value: unknown): BookCompile {
  const fallbackLevels: CompileLevel[] = [
    { include: false, name: "", heading: "none" },
    { include: true, name: "Chapter", heading: "title" },
  ];
  if (!isRecord(value)) {
    return {
      levels: fallbackLevels,
      sceneTitles: false,
      sceneBreak: "hash",
      titleOnly: [],
      useAppAuthor: true,
      author: defaultCompileIdentity(),
      format: defaultCompileFormat(),
    };
  }
  const levels = Array.isArray(value.levels) ? parseLevels(value.levels) ?? fallbackLevels : fallbackLevels;
  return {
    levels,
    sceneTitles: value.sceneTitles === true,
    sceneBreak: sceneBreak(value.sceneBreak),
    titleOnly: Array.isArray(value.titleOnly) ? value.titleOnly.filter((id): id is string => typeof id === "string") : [],
    useAppAuthor: value.useAppAuthor !== false,
    author: compileIdentity(value.author),
    format: compileFormat(value.format),
  };
}

function parseLevels(value: unknown[]): CompileLevel[] | null {
  const levels: CompileLevel[] = [];
  for (const entry of value) {
    const level = parseLevel(entry);
    if (!level) {
      return null;
    }
    levels.push(level);
  }
  return levels;
}

function parseLevel(value: unknown): CompileLevel | null {
  if (!isRecord(value)) {
    return null;
  }
  const heading = levelHeading(value.heading);
  if (!heading) {
    return null;
  }
  return {
    include: value.include === true,
    name: typeof value.name === "string" ? value.name : "",
    heading,
  };
}

function levelHeading(value: unknown): LevelHeading | null {
  switch (value) {
    case "none":
    case "title":
    case "number":
    case "numberTitle":
    case "word":
    case "written":
      return value;
    default:
      return null;
  }
}

function sceneBreak(value: unknown): SceneBreak {
  switch (value) {
    case "hash":
    case "stars":
    case "blank":
      return value;
    default:
      return "hash";
  }
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
