import { bundledFontFamilies, cssGenericFor, isBundledFontFamily } from "./bundledFonts.ts";
import type { CompileHeading, CompilePreset } from "./bookCompile.ts";
import { fontName } from "./pageLayout.ts";
import type { EditorBlock, EditorDoc, Mark } from "./model/editorDoc.ts";
import type { BinderNode, FolderNode, ProjectFile } from "./model/project.ts";
import { listFonts } from "./storage.ts";

export type FontReplacements = Record<string, string>;

export type FontRemapAsk = {
  missing: string[];
  available: string[];
};

let catalog: string[] | null = null;
let catalogPromise: Promise<string[]> | null = null;

export async function availableFonts(options: { refresh?: boolean } = {}): Promise<string[]> {
  if (options.refresh) {
    catalog = null;
    catalogPromise = null;
  }
  if (catalog) {
    return catalog;
  }
  if (!catalogPromise) {
    catalogPromise = listFonts()
      .then((system) => {
        catalog = [...new Set([...bundledFontFamilies, ...system])].sort((a, b) => a.localeCompare(b));
        return catalog;
      })
      .catch((error: unknown) => {
        catalogPromise = null;
        throw error;
      });
  }
  return catalogPromise;
}

export function bundledFontFallback(): string[] {
  return [...bundledFontFamilies];
}

/** CSS stack for a face named in the book. */
export function displayFontFamily(name: string): string {
  const face = fontName(name).replace(/"/g, "");
  const generic = isBundledFontFamily(face) ? cssGenericFor(face) : "serif";
  return `"${face}", ${generic}`;
}

export function collectBookFonts(project: ProjectFile): string[] {
  const names = new Set<string>();
  mapBookFonts(project, (face) => {
    names.add(face);
    return face;
  });
  return [...names].sort((a, b) => a.localeCompare(b));
}

export function missingBookFonts(project: ProjectFile, available: readonly string[]): string[] {
  const have = new Set(available);
  return collectBookFonts(project).filter((name) => !have.has(name));
}

/**
 * Replace named faces in the in-memory project (layout, compile presets, scene marks).
 * Returns a new project object for React state; unchanged subtrees are reused.
 */
export function rewriteBookFonts(project: ProjectFile, replacements: FontReplacements): ProjectFile {
  const map = cleanReplacements(replacements);
  if (Object.keys(map).length === 0) {
    return project;
  }
  return mapBookFonts(project, (face) => map[face] || face);
}

function cleanReplacements(replacements: FontReplacements): FontReplacements {
  const map: FontReplacements = {};
  for (const [from, to] of Object.entries(replacements)) {
    const logical = fontName(from);
    const standIn = fontName(to);
    if (logical && standIn && logical !== standIn) {
      map[logical] = standIn;
    }
  }
  return map;
}

function mapBookFonts(project: ProjectFile, replace: (face: string) => string): ProjectFile {
  const layoutFont = replaceNamed(project.layout.font, replace);
  const layout = layoutFont === project.layout.font ? project.layout : { ...project.layout, font: layoutFont };
  const presets = mapList(project.compile.presets, (preset) => mapPreset(preset, replace));
  const compile =
    presets === project.compile.presets ? project.compile : { ...project.compile, presets };
  const manuscript = mapFolder(project.manuscript, replace);
  const notes = mapFolder(project.notes, replace);
  const publishing = mapFolder(project.publishing, replace);
  const trash = mapFolder(project.trash, replace);
  if (
    layout === project.layout &&
    compile === project.compile &&
    manuscript === project.manuscript &&
    notes === project.notes &&
    publishing === project.publishing &&
    trash === project.trash
  ) {
    return project;
  }
  return { ...project, layout, compile, manuscript, notes, publishing, trash };
}

function mapPreset(preset: CompilePreset, replace: (face: string) => string): CompilePreset {
  const font = replaceNamed(preset.format.font, replace);
  const format = font === preset.format.font ? preset.format : { ...preset.format, font };
  const scenes = mapHeading(preset.scenes, replace);
  const levels = mapList(preset.levels, (level) => mapHeading(level, replace));
  if (format === preset.format && scenes === preset.scenes && levels === preset.levels) {
    return preset;
  }
  return { ...preset, format, scenes, levels };
}

function mapHeading<T extends CompileHeading>(heading: T, replace: (face: string) => string): T {
  const nameFont = replaceOptional(heading.nameFont, replace);
  const titleFont = replaceOptional(heading.titleFont, replace);
  if (nameFont === heading.nameFont && titleFont === heading.titleFont) {
    return heading;
  }
  return { ...heading, nameFont, titleFont };
}

function replaceNamed(value: string, replace: (face: string) => string): string {
  return replace(fontName(value));
}

/** Empty heading fonts mean inherit — leave blank. */
function replaceOptional(value: string, replace: (face: string) => string): string {
  if (!value.trim()) {
    return value;
  }
  return replace(fontName(value));
}

function mapFolder(node: FolderNode, replace: (face: string) => string): FolderNode {
  const children = mapList(node.children, (child) => mapBinder(child, replace));
  return children === node.children ? node : { ...node, children };
}

function mapBinder(node: BinderNode, replace: (face: string) => string): BinderNode {
  if (node.kind === "document") {
    const content = mapDoc(node.content, replace);
    return content === node.content ? node : { ...node, content };
  }
  return mapFolder(node, replace);
}

function mapDoc(doc: EditorDoc, replace: (face: string) => string): EditorDoc {
  const content = mapList(doc.content, (block) => mapBlock(block, replace));
  return content === doc.content ? doc : { ...doc, content };
}

function mapBlock(block: EditorBlock, replace: (face: string) => string): EditorBlock {
  switch (block.type) {
    case "paragraph": {
      if (!block.content) {
        return block;
      }
      const content = mapList(block.content, (inline) => {
        if (inline.type !== "text" || !inline.marks) {
          return inline;
        }
        const marks = mapList(inline.marks, (mark) => mapMark(mark, replace));
        return marks === inline.marks ? inline : { ...inline, marks };
      });
      return content === block.content ? block : { ...block, content };
    }
    case "bulletList":
    case "orderedList": {
      const content = mapList(block.content, (item) => {
        const nested = mapList(item.content, (child) => mapBlock(child, replace));
        return nested === item.content ? item : { ...item, content: nested };
      });
      return content === block.content ? block : { ...block, content };
    }
    default: {
      const unexpected: never = block;
      return unexpected;
    }
  }
}

function mapMark(mark: Mark, replace: (face: string) => string): Mark {
  if (mark.type !== "textStyle" || !mark.attrs.fontFamily) {
    return mark;
  }
  const fontFamily = replaceNamed(mark.attrs.fontFamily, replace);
  if (fontFamily === mark.attrs.fontFamily) {
    return mark;
  }
  return { ...mark, attrs: { ...mark.attrs, fontFamily } };
}

function mapList<T>(items: readonly T[], mapItem: (item: T) => T): T[] {
  let changed = false;
  const next = items.map((item) => {
    const mapped = mapItem(item);
    if (mapped !== item) {
      changed = true;
    }
    return mapped;
  });
  return changed ? next : (items as T[]);
}
