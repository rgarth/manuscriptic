import type { CompilePreferences, CompileSpacing, PageNumbers } from "./compilePrefs.ts";
import { fillDocument, fillText, type CompileValues, type FillPart } from "./compileVars.ts";
import type { Alignment } from "./pageLayout.ts";
import {
  wordCount,
  type EditorBlock,
  type EditorDoc,
  type Inline,
  type Mark,
} from "./model/editorDoc.ts";
import type {
  BinderNode,
  CompileLevel,
  FolderNode,
  LevelHeading,
  MatterPlace,
  ProjectFile,
  SceneBreak,
} from "./model/project.ts";

export type CompileRun =
  | { kind: "text"; text: string; marks: Mark[] }
  | { kind: "break" }
  | { kind: "page" };

export type CompileParagraph = {
  runs: CompileRun[];
  align: Alignment;
  indent: boolean;
  pageBreakBefore: boolean;
};

export type CompileDocument = {
  paragraphs: CompileParagraph[];
  header: CompileRun[];
  footer: CompileRun[];
  margins: CompilePreferences["margins"];
  font: string;
  points: number;
  spacing: CompileSpacing;
  spaceBefore: number;
  spaceAfter: number;
  indentInches: number;
  differentFirstPage: boolean;
  title: string;
  creator: string;
  missing: string[];
  hasDocument: boolean;
};

const dropLines = 8;
const linesAfterHeading = 2;

export function buildCompile(
  project: ProjectFile,
  included: ReadonlySet<string>,
  preferences: CompilePreferences,
  year: number,
): CompileDocument {
  const missing: string[] = [];
  const chosen = { hasDocument: false };
  const values: CompileValues = {
    author: preferences.author,
    pen: preferences.pen,
    address: preferences.address,
    phone: preferences.phone,
    email: preferences.email,
    title: project.title,
    words: String(compileWordCount(project)),
    year: String(year),
  };
  const paragraphs = [
    ...matterParagraphs(project, included, "front", values, missing, chosen),
    ...manuscriptParagraphs(project, included, values, missing, preferences.align, chosen),
    ...matterParagraphs(project, included, "back", values, missing, chosen),
    ...matterParagraphs(project, included, "other", values, missing, chosen),
  ];
  return {
    paragraphs,
    header: furniture(preferences.header, values, preferences.pageNumbers, "header", missing),
    footer: furniture(preferences.footer, values, preferences.pageNumbers, "footer", missing),
    margins: preferences.margins,
    font: preferences.passFont ? project.layout.font : preferences.font,
    points: preferences.passFont ? project.layout.points : preferences.points,
    spacing: preferences.spacing,
    spaceBefore: preferences.spaceBefore,
    spaceAfter: preferences.spaceAfter,
    indentInches: preferences.indent,
    differentFirstPage: preferences.differentFirstPage,
    title: project.title,
    creator: preferences.author,
    missing,
    hasDocument: chosen.hasDocument,
  };
}

function compileWordCount(project: ProjectFile): number {
  return countedWords(project.manuscript);
}

function countedWords(node: BinderNode): number {
  switch (node.kind) {
    case "document":
      return node.includeInCompile ? wordCount(node.content) : 0;
    case "folder":
      return node.children.reduce((sum, child) => sum + countedWords(child), 0);
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}

type ScenePiece = { title: string; content: EditorDoc };

type SectionHeading = {
  rank: number;
  title: string;
  name: string;
  heading: LevelHeading;
  titleOnly: boolean;
};

type ManuscriptRun =
  | { kind: "text"; scenes: ScenePiece[]; sceneTitles: boolean }
  | { kind: "section"; heading: SectionHeading; runs: ManuscriptRun[] };

type Structure = {
  included: ReadonlySet<string>;
  titleOnly: ReadonlySet<string>;
  levels: readonly CompileLevel[];
  sceneTitles: boolean;
};

function manuscriptParagraphs(
  project: ProjectFile,
  included: ReadonlySet<string>,
  values: CompileValues,
  missing: string[],
  align: Alignment,
  chosen: { hasDocument: boolean },
): CompileParagraph[] {
  const structure: Structure = {
    included,
    titleOnly: new Set(project.compile.titleOnly),
    levels: project.compile.levels,
    sceneTitles: project.compile.sceneTitles,
  };
  const state: EmitState = {
    paragraphs: [],
    pageOpen: false,
    sceneOnPage: false,
    numbers: [],
    missing,
    align,
    sceneBreak: project.compile.sceneBreak,
    chosen,
    values,
  };
  emitRuns(walk(project.manuscript, structure).runs, [], state);
  return state.paragraphs;
}

function walk(folder: FolderNode, structure: Structure): { runs: ManuscriptRun[]; rank: number } {
  const runs: ManuscriptRun[] = [];
  let scenes: ScenePiece[] = [];
  let deepest = 0;
  function flush() {
    if (scenes.length === 0) {
      return;
    }
    runs.push({ kind: "text", scenes, sceneTitles: structure.sceneTitles });
    scenes = [];
  }
  for (const child of folder.children) {
    switch (child.kind) {
      case "document":
        if (!structure.included.has(child.id)) {
          break;
        }
        if (isSection(child.id, 0, structure)) {
          flush();
          runs.push({
            kind: "section",
            heading: sectionHeading(child.id, child.title, 0, structure),
            runs: [{ kind: "text", scenes: [{ title: child.title, content: child.content }], sceneTitles: false }],
          });
        } else {
          scenes.push({ title: child.title, content: child.content });
        }
        break;
      case "folder": {
        flush();
        const inner = walk(child, structure);
        if (inner.runs.length === 0) {
          break;
        }
        deepest = Math.max(deepest, inner.rank);
        if (isSection(child.id, inner.rank, structure)) {
          runs.push({
            kind: "section",
            heading: sectionHeading(child.id, child.title, inner.rank, structure),
            runs: inner.runs,
          });
        } else {
          absorb(runs, inner.runs);
        }
        break;
      }
      default: {
        const unexpected: never = child;
        return unexpected;
      }
    }
  }
  flush();
  return { runs, rank: deepest + 1 };
}

function isSection(id: string, rank: number, structure: Structure): boolean {
  return structure.levels[rank]?.include === true && structure.included.has(id);
}

function sectionHeading(id: string, title: string, rank: number, structure: Structure): SectionHeading {
  const level = structure.levels[rank];
  return {
    rank,
    title,
    name: level?.name ?? "",
    heading: level?.heading ?? "none",
    titleOnly: structure.titleOnly.has(id),
  };
}

function absorb(runs: ManuscriptRun[], extra: ManuscriptRun[]) {
  for (const run of extra) {
    const last = runs[runs.length - 1];
    if (run.kind === "text" && last?.kind === "text") {
      last.scenes.push(...run.scenes);
      continue;
    }
    runs.push(run);
  }
}

type EmitState = {
  paragraphs: CompileParagraph[];
  pageOpen: boolean;
  sceneOnPage: boolean;
  numbers: number[];
  missing: string[];
  align: Alignment;
  sceneBreak: SceneBreak;
  chosen: { hasDocument: boolean };
  values: CompileValues;
};

function emitRuns(runs: ManuscriptRun[], pending: SectionHeading[], state: EmitState) {
  let carried = pending;
  for (const run of runs) {
    switch (run.kind) {
      case "section":
        if (hasSection(run.runs)) {
          emitRuns(run.runs, [...carried, run.heading], state);
        } else {
          openPage([...carried, run.heading], state);
          emitRuns(run.runs, [], state);
        }
        carried = [];
        break;
      case "text":
        if (carried.length > 0) {
          openPage(carried, state);
          carried = [];
        }
        writeScenes(run, state);
        break;
      default: {
        const unexpected: never = run;
        return unexpected;
      }
    }
  }
}

function hasSection(runs: ManuscriptRun[]): boolean {
  for (const run of runs) {
    switch (run.kind) {
      case "section":
        return true;
      case "text":
        break;
      default: {
        const unexpected: never = run;
        return unexpected;
      }
    }
  }
  return false;
}

function openPage(headings: SectionHeading[], state: EmitState) {
  const lines: string[] = [];
  let drop = false;
  for (const heading of headings) {
    const mode = shownHeading(heading);
    if (mode !== "none") {
      drop = true;
    }
    const text = headingText(heading.name, mode, heading.title, takeNumber(heading.rank, mode, state.numbers));
    if (text !== null) {
      lines.push(text);
    }
  }
  if (drop) {
    for (let line = 0; line < dropLines; line += 1) {
      state.paragraphs.push(blankParagraph());
    }
    const first = state.paragraphs[state.paragraphs.length - dropLines];
    if (first) {
      first.pageBreakBefore = true;
    }
    lines.forEach((line, index) => {
      state.paragraphs.push(centered(line));
      const blanks = index === lines.length - 1 ? linesAfterHeading : 1;
      for (let extra = 0; extra < blanks; extra += 1) {
        state.paragraphs.push(blankParagraph());
      }
    });
    state.pageOpen = true;
  } else {
    state.pageOpen = false;
  }
  state.sceneOnPage = false;
}

function shownHeading(heading: SectionHeading): LevelHeading {
  switch (heading.heading) {
    case "none":
    case "written":
      return heading.heading;
    case "title":
    case "number":
    case "numberTitle":
    case "word":
      return heading.titleOnly ? "title" : heading.heading;
    default: {
      const unexpected: never = heading.heading;
      return unexpected;
    }
  }
}

function takeNumber(rank: number, mode: LevelHeading, numbers: number[]): number | null {
  switch (mode) {
    case "none":
    case "title":
    case "written":
      return null;
    case "number":
    case "numberTitle":
    case "word": {
      const next = (numbers[rank] ?? 0) + 1;
      numbers[rank] = next;
      return next;
    }
    default: {
      const unexpected: never = mode;
      return unexpected;
    }
  }
}

function writeScenes(run: Extract<ManuscriptRun, { kind: "text" }>, state: EmitState) {
  for (const scene of run.scenes) {
    const blocks: CompileParagraph[] = [];
    if (run.sceneTitles) {
      blocks.push(centered(scene.title));
    } else if (state.sceneOnPage) {
      blocks.push(sceneBreakParagraph(state.sceneBreak));
    }
    const filled = fillDocument(scene.content, state.values);
    rememberMissing(state.missing, filled.missing);
    blocks.push(...blocksToParagraphs(filled.doc.content, state.align, true));
    if (!state.pageOpen && blocks[0]) {
      blocks[0].pageBreakBefore = true;
      state.pageOpen = true;
    }
    if (blocks.length > 0) {
      state.sceneOnPage = true;
    }
    state.chosen.hasDocument = true;
    state.paragraphs.push(...blocks);
  }
}

function headingText(name: string, mode: LevelHeading, title: string, number: number | null): string | null {
  const label = name.trim();
  switch (mode) {
    case "none":
    case "written":
      return null;
    case "title":
      return title;
    case "number":
      return number === null ? title : joinLabel(label, String(number));
    case "numberTitle":
      return number === null ? title : `${joinLabel(label, String(number))}: ${title}`;
    case "word":
      return number === null ? title : joinLabel(label, numberName(number));
    default: {
      const unexpected: never = mode;
      return unexpected;
    }
  }
}

function joinLabel(label: string, value: string): string {
  return label ? `${label} ${value}` : value;
}

function numberName(value: number): string {
  const small = [
    "Zero",
    "One",
    "Two",
    "Three",
    "Four",
    "Five",
    "Six",
    "Seven",
    "Eight",
    "Nine",
    "Ten",
    "Eleven",
    "Twelve",
    "Thirteen",
    "Fourteen",
    "Fifteen",
    "Sixteen",
    "Seventeen",
    "Eighteen",
    "Nineteen",
  ];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  if (value < 20) {
    return small[value] ?? String(value);
  }
  if (value < 100) {
    const ten = tens[Math.floor(value / 10)] ?? "";
    const rest = value % 10;
    return rest === 0 ? ten : `${ten}-${small[rest] ?? ""}`;
  }
  if (value < 1000) {
    const hundreds = `${small[Math.floor(value / 100)] ?? ""} Hundred`;
    const rest = value % 100;
    return rest === 0 ? hundreds : `${hundreds} ${numberName(rest)}`;
  }
  return String(value);
}

function matterParagraphs(
  project: ProjectFile,
  included: ReadonlySet<string>,
  place: "front" | "back" | "other",
  values: CompileValues,
  missing: string[],
  chosen: { hasDocument: boolean },
): CompileParagraph[] {
  const pages = publishingDocs(project.publishing, included, place);
  if (pages.length > 0) {
    chosen.hasDocument = true;
  }
  const paragraphs: CompileParagraph[] = [];
  for (const page of pages) {
    const filled = fillDocument(page, values);
    rememberMissing(missing, filled.missing);
    const body = blocksToParagraphs(filled.doc.content, "left", false);
    const start = body.length > 0 ? body : [blankParagraph()];
    const opening = start[0];
    if (opening) {
      opening.pageBreakBefore = true;
    }
    paragraphs.push(...start);
  }
  return paragraphs;
}

function publishingDocs(
  publishing: FolderNode,
  included: ReadonlySet<string>,
  place: "front" | "back" | "other",
): EditorDoc[] {
  const front = folderByMatter(publishing, "front");
  const back = folderByMatter(publishing, "back");
  switch (place) {
    case "front":
      return front ? docsIn(front, included) : [];
    case "back":
      return back ? docsIn(back, included) : [];
    case "other":
      return publishing.children.flatMap((child) => {
        if (child === front || child === back) {
          return [];
        }
        switch (child.kind) {
          case "document":
            return included.has(child.id) ? [child.content] : [];
          case "folder":
            return docsIn(child, included);
          default: {
            const unexpected: never = child;
            return unexpected;
          }
        }
      });
    default: {
      const unexpected: never = place;
      return unexpected;
    }
  }
}

function folderByMatter(folder: FolderNode, matter: MatterPlace): FolderNode | null {
  const found = folder.children.find((child) => child.kind === "folder" && child.matter === matter);
  return found?.kind === "folder" ? found : null;
}

function docsIn(folder: FolderNode, included: ReadonlySet<string>): EditorDoc[] {
  const docs: EditorDoc[] = [];
  for (const child of folder.children) {
    switch (child.kind) {
      case "document":
        if (included.has(child.id)) {
          docs.push(child.content);
        }
        break;
      case "folder":
        docs.push(...docsIn(child, included));
        break;
      default: {
        const unexpected: never = child;
        return unexpected;
      }
    }
  }
  return docs;
}

function blocksToParagraphs(blocks: readonly EditorBlock[], align: Alignment, indent: boolean): CompileParagraph[] {
  const paragraphs: CompileParagraph[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case "paragraph":
        paragraphs.push({
          runs: inlinesToRuns(block.content ?? []),
          align,
          indent,
          pageBreakBefore: false,
        });
        break;
      case "bulletList":
        paragraphs.push(...listParagraphs(block.content, align, "bullet", 1));
        break;
      case "orderedList":
        paragraphs.push(...listParagraphs(block.content, align, "number", block.attrs?.start ?? 1));
        break;
      default: {
        const unexpected: never = block;
        return unexpected;
      }
    }
  }
  return paragraphs;
}

function listParagraphs(
  items: { content: EditorBlock[] }[],
  align: Alignment,
  kind: "bullet" | "number",
  start: number,
): CompileParagraph[] {
  const paragraphs: CompileParagraph[] = [];
  items.forEach((item, itemIndex) => {
    let marked = false;
    for (const block of item.content) {
      switch (block.type) {
        case "paragraph": {
          const marker = marked ? "" : kind === "bullet" ? "• " : `${start + itemIndex}. `;
          marked = true;
          paragraphs.push({
            runs: [...(marker ? [{ kind: "text" as const, text: marker, marks: [] }] : []), ...inlinesToRuns(block.content ?? [])],
            align,
            indent: false,
            pageBreakBefore: false,
          });
          break;
        }
        case "bulletList":
          paragraphs.push(...listParagraphs(block.content, align, "bullet", 1));
          break;
        case "orderedList":
          paragraphs.push(...listParagraphs(block.content, align, "number", block.attrs?.start ?? 1));
          break;
        default: {
          const unexpected: never = block;
          return unexpected;
        }
      }
    }
  });
  return paragraphs;
}

function inlinesToRuns(inlines: readonly Inline[]): CompileRun[] {
  const runs: CompileRun[] = [];
  for (const inline of inlines) {
    switch (inline.type) {
      case "hardBreak":
        runs.push({ kind: "break" });
        break;
      case "text":
        if (inline.text) {
          runs.push({ kind: "text", text: inline.text, marks: inline.marks ?? [] });
        }
        break;
      default: {
        const unexpected: never = inline;
        return unexpected;
      }
    }
  }
  return runs;
}

function blankParagraph(): CompileParagraph {
  return { runs: [], align: "left", indent: false, pageBreakBefore: false };
}

function centered(text: string): CompileParagraph {
  return {
    runs: text ? [{ kind: "text", text, marks: [] }] : [],
    align: "center",
    indent: false,
    pageBreakBefore: false,
  };
}

function sceneBreakParagraph(sceneBreak: SceneBreak): CompileParagraph {
  switch (sceneBreak) {
    case "hash":
      return centered("#");
    case "stars":
      return centered("* * *");
    case "blank":
      return blankParagraph();
    default: {
      const unexpected: never = sceneBreak;
      return unexpected;
    }
  }
}

function furniture(
  template: string,
  values: CompileValues,
  pageNumbers: PageNumbers,
  place: "header" | "footer",
  missing: string[],
): CompileRun[] {
  const filled = fillText(template, values, "furniture");
  rememberMissing(missing, filled.missing.filter((name) => name !== "page"));
  let parts = filled.parts;
  const showPage = pageNumbers === place;
  if (!showPage) {
    parts = parts.filter((part) => part.kind !== "page");
  } else if (!parts.some((part) => part.kind === "page")) {
    parts = [...parts, { kind: "page" }];
  }
  return parts.flatMap((part) => fillPartToRuns(part));
}

function fillPartToRuns(part: FillPart): CompileRun[] {
  switch (part.kind) {
    case "text":
      return part.text ? [{ kind: "text", text: part.text, marks: [] }] : [];
    case "break":
      return [{ kind: "break" }];
    case "page":
      return [{ kind: "page" }];
    default: {
      const unexpected: never = part;
      return unexpected;
    }
  }
}

function rememberMissing(missing: string[], names: readonly string[]) {
  for (const name of names) {
    if (!missing.includes(name)) {
      missing.push(name);
    }
  }
}
