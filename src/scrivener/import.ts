import { projectFromImport } from "../importedBook.ts";
import { emptyDoc, type EditorBlock, type EditorDoc } from "../model/editorDoc.ts";
import {
  documentNode,
  folderNode,
  type BinderNode,
  type DocumentNode,
  type DocumentRole,
  type ProjectFile,
} from "../model/project.ts";
import { rtfToDoc } from "./rtf.ts";

export type ScrivenerPackage = {
  scrivx: string;
  content: Record<string, string>;
  notes: Record<string, string>;
  synopsis: Record<string, string>;
};

type ScrivenerItem = {
  uuid: string;
  type: string;
  title: string;
  include: boolean | null;
  children: ScrivenerItem[];
};

type XmlNode = {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
};

export function scrivenerTitle(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const name = path
    .slice(slash + 1)
    .replace(/\.scrivx$/i, "")
    .replace(/\.scriv$/i, "")
    .trim();
  return name || "Imported Novel";
}

type PlacedBinder = {
  manuscript: ScrivenerItem | null;
  trash: ScrivenerItem | null;
  front: ScrivenerItem | null;
  back: ScrivenerItem | null;
  notes: ScrivenerItem[];
};

export function projectFromScrivener(title: string, files: ScrivenerPackage, keepStarters: boolean): ProjectFile | null {
  const xml = parseXml(files.scrivx);
  if (!xml) {
    return null;
  }
  const binder = binderItems(xml);
  if (!binder) {
    return null;
  }
  const templateId = directChild(xml, "TemplateFolderUUID")?.text.trim().toLowerCase() ?? "";
  const template = templateId ? binder.find((item) => item.uuid.toLowerCase() === templateId) : undefined;
  const placed = placeBinder(binder, template);
  const documentNotes = collectNotes(
    [placed.manuscript, placed.trash].filter((item) => item !== null),
    files,
  );
  return projectFromImport(
    {
      title,
      manuscript: placed.manuscript ? convertList(placed.manuscript.children, "scene", files) : [],
      notes: placed.notes.length > 0 ? convertList(placed.notes, "note", files) : null,
      extraNotes: documentNotes.length > 0 ? [folderNode("Document notes", documentNotes, false)] : [],
      frontMatter: placed.front ? convertList(placed.front.children, "page", files) : null,
      backMatter: placed.back ? convertList(placed.back.children, "page", files) : null,
      trash: placed.trash ? convertList(placed.trash.children, "scene", files) : [],
    },
    keepStarters,
  );
}

function placeBinder(binder: ScrivenerItem[], template: ScrivenerItem | undefined): PlacedBinder {
  const placed: PlacedBinder = { manuscript: null, trash: null, front: null, back: null, notes: [] };
  for (const item of binder) {
    if (item === template) {
      continue;
    }
    if (item.type === "DraftFolder") {
      placed.manuscript ??= item;
      continue;
    }
    if (item.type === "TrashFolder") {
      placed.trash ??= item;
      continue;
    }
    if (item.type === "ResearchFolder") {
      placed.notes.push(...item.children);
      continue;
    }
    if (isContainer(item) && sameTitle(item.title, "Front Matter")) {
      placed.front ??= item;
      continue;
    }
    if (isContainer(item) && sameTitle(item.title, "Back Matter")) {
      placed.back ??= item;
      continue;
    }
    placed.notes.push(item);
  }
  return placed;
}

function isContainer(item: ScrivenerItem): boolean {
  return item.type.endsWith("Folder") || item.children.length > 0;
}

function sameTitle(left: string, right: string): boolean {
  return left.localeCompare(right, undefined, { sensitivity: "accent" }) === 0;
}

function convertList(items: ScrivenerItem[], role: DocumentRole, files: ScrivenerPackage): BinderNode[] {
  return items.map((item) => convertItem(item, role, files));
}

function convertItem(item: ScrivenerItem, role: DocumentRole, files: ScrivenerPackage): BinderNode {
  const content = itemContent(item, role, files);
  const children = convertList(item.children, role, files);
  const include = included(item, role);
  if (isContainer(item)) {
    const body = hasText(content) ? [document(item.title, role, content, include)] : [];
    return folderNode(item.title, [...body, ...children], include);
  }
  return document(item.title, role, content, include);
}

function itemContent(item: ScrivenerItem, role: DocumentRole, files: ScrivenerPackage): EditorDoc {
  const body = rtfToDoc(stored(files.content, item.uuid));
  switch (role) {
    case "scene":
    case "page":
      return body;
    case "note": {
      const notes = noteDoc(stored(files.synopsis, item.uuid), stored(files.notes, item.uuid));
      if (!notes) {
        return body;
      }
      if (!hasText(body)) {
        return notes;
      }
      return { type: "doc", content: [...body.content, ...notes.content] };
    }
    default: {
      const unexpected: never = role;
      return unexpected;
    }
  }
}

function collectNotes(items: ScrivenerItem[], files: ScrivenerPackage): DocumentNode[] {
  const notes: DocumentNode[] = [];
  function visit(item: ScrivenerItem) {
    const doc = noteDoc(stored(files.synopsis, item.uuid), stored(files.notes, item.uuid));
    if (doc) {
      notes.push(document(item.title, "note", doc, false));
    }
    for (const child of item.children) {
      visit(child);
    }
  }
  for (const item of items) {
    visit(item);
  }
  return notes;
}

function document(title: string, role: DocumentRole, content: EditorDoc, include: boolean): DocumentNode {
  return { ...documentNode(title, role), content, includeInCompile: include };
}

function included(item: ScrivenerItem, role: DocumentRole): boolean {
  if (item.include !== null) {
    return item.include;
  }
  return role !== "note";
}

function stored(files: Record<string, string>, uuid: string): string {
  if (!uuid) {
    return "";
  }
  if (files[uuid] !== undefined) {
    return files[uuid];
  }
  const key = Object.keys(files).find((item) => item.toLowerCase() === uuid.toLowerCase());
  return key ? files[key] : "";
}

function noteDoc(synopsis: string, notes: string): EditorDoc | null {
  const content: EditorBlock[] = [];
  const synopsisDoc = plainDoc(synopsis);
  const notesDoc = notes ? rtfToDoc(notes) : emptyDoc();
  if (hasText(synopsisDoc)) {
    content.push(...synopsisDoc.content);
  }
  if (hasText(notesDoc)) {
    content.push(...notesDoc.content);
  }
  if (content.length === 0) {
    return null;
  }
  return { type: "doc", content };
}

function plainDoc(text: string): EditorDoc {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!normalized.trim()) {
    return emptyDoc();
  }
  return {
    type: "doc",
    content: normalized.split("\n").map((line) =>
      line.length > 0 ? { type: "paragraph" as const, content: [{ type: "text" as const, text: line }] } : { type: "paragraph" as const },
    ),
  };
}

function hasText(doc: EditorDoc): boolean {
  return doc.content.some((block) => blockHasText(block));
}

function blockHasText(block: EditorBlock): boolean {
  switch (block.type) {
    case "paragraph":
      return (block.content ?? []).some(
        (inline) => inline.type === "hardBreak" || inline.text.trim().length > 0,
      );
    case "bulletList":
    case "orderedList":
      return block.content.some((item) => item.content.some((child) => blockHasText(child)));
    default: {
      const unexpected: never = block;
      return unexpected;
    }
  }
}

function binderItems(xml: XmlNode): ScrivenerItem[] | null {
  const binder = findChild(xml, "Binder") ?? findNamed(xml, "Binder");
  if (!binder) {
    return null;
  }
  return binder.children.filter((child) => child.name === "BinderItem").map(itemFrom);
}

function itemFrom(node: XmlNode): ScrivenerItem {
  const title = directChild(node, "Title")?.text.trim() || "Untitled";
  const includeText = directChild(directChild(node, "MetaData"), "IncludeInCompile")?.text.trim().toLowerCase();
  const children = directChild(node, "Children");
  return {
    uuid: node.attrs.UUID ?? "",
    type: node.attrs.Type ?? "Text",
    title,
    include: includeText === "yes" ? true : includeText === "no" ? false : null,
    children: children ? children.children.filter((child) => child.name === "BinderItem").map(itemFrom) : [],
  };
}

function directChild(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((child) => child.name === name);
}

function findChild(node: XmlNode, name: string): XmlNode | undefined {
  return node.name === name ? node : node.children.find((child) => child.name === name);
}

function findNamed(node: XmlNode, name: string): XmlNode | undefined {
  if (node.name === name) {
    return node;
  }
  for (const child of node.children) {
    const found = findNamed(child, name);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function parseXml(source: string): XmlNode | null {
  const root: XmlNode = { name: "", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let index = source.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (index < source.length) {
    if (source.startsWith("<?", index) || source.startsWith("<!", index)) {
      const end = source.indexOf(">", index);
      if (end < 0) {
        return null;
      }
      index = end + 1;
      continue;
    }
    if (source[index] === "<") {
      if (source[index + 1] === "/") {
        const end = source.indexOf(">", index);
        if (end < 0) {
          return null;
        }
        if (stack.length > 1) {
          stack.pop();
        }
        index = end + 1;
        continue;
      }
      const end = source.indexOf(">", index);
      if (end < 0) {
        return null;
      }
      const raw = source.slice(index + 1, end).trim();
      const selfClosing = raw.endsWith("/");
      const node = parseTag(selfClosing ? raw.slice(0, -1).trim() : raw);
      if (!node) {
        return null;
      }
      stack[stack.length - 1]?.children.push(node);
      if (!selfClosing) {
        stack.push(node);
      }
      index = end + 1;
      continue;
    }
    const next = source.indexOf("<", index);
    const chunk = source.slice(index, next < 0 ? source.length : next);
    const current = stack[stack.length - 1];
    if (current) {
      current.text += decodeXml(chunk);
    }
    index = next < 0 ? source.length : next;
  }
  return root.children.find((child) => child.name.length > 0) ?? null;
}

function parseTag(body: string): XmlNode | null {
  const nameEnd = body.search(/[\s/]/);
  const name = (nameEnd < 0 ? body : body.slice(0, nameEnd)).trim();
  if (!name) {
    return null;
  }
  const attrs: Record<string, string> = {};
  const attr = /([A-Za-z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (const match of body.matchAll(attr)) {
    attrs[match[1]] = decodeXml(match[3] ?? match[4] ?? "");
  }
  return { name, attrs, children: [], text: "" };
}

function decodeXml(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, token: string) => {
    if (token.startsWith("#")) {
      const code =
        token[1] === "x" || token[1] === "X"
          ? Number.parseInt(token.slice(2), 16)
          : Number.parseInt(token.slice(1), 10);
      if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) {
        return whole;
      }
      return String.fromCodePoint(code);
    }
    switch (token) {
      case "amp":
        return "&";
      case "lt":
        return "<";
      case "gt":
        return ">";
      case "quot":
        return '"';
      case "apos":
        return "'";
      default:
        return whole;
    }
  });
}
