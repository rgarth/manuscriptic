import { bookCompile, defaultBookCompile, type BookCompile } from "../bookCompile.ts";
import { uniqueWords } from "../dictionary.ts";
import { defaultPageLayout, pageLayout, type PageLayout } from "../pageLayout.ts";
import { publishingStarter } from "../publishingPages.ts";
import { emptyDoc, parseEditorDoc, wordCount, type EditorDoc } from "./editorDoc.ts";

export type TrashOrigin = {
  parentId: string;
  index: number;
  root: Exclude<RootKey, "trash">;
};

type BinderFields = {
  id: string;
  title: string;
  includeInCompile: boolean;
  origin?: TrashOrigin;
};

export const matterPlaces = ["front", "back"] as const;
export type MatterPlace = (typeof matterPlaces)[number];

export type FolderNode = BinderFields & {
  kind: "folder";
  children: BinderNode[];
  matter?: MatterPlace;
};

export type DocumentRole = "scene" | "note" | "page";

export type DocumentNode = BinderFields & {
  kind: "document";
  role: DocumentRole;
  content: EditorDoc;
};

export type BinderNode = FolderNode | DocumentNode;

export const ROOT_KEYS = ["manuscript", "notes", "publishing", "trash"] as const;

export type RootKey = (typeof ROOT_KEYS)[number];

export type ProjectView = {
  selectedId: string | null;
  expanded: string[] | null;
};

export type { PageLayout };

export type ProjectFile = {
  version: 2;
  title: string;
  manuscript: FolderNode;
  notes: FolderNode;
  publishing: FolderNode;
  trash: FolderNode;
  dictionary: string[];
  layout: PageLayout;
  compile: BookCompile;
  view: ProjectView;
};

export type LocatedNode = {
  node: BinderNode;
  parent: FolderNode | null;
  root: RootKey;
};

export type InsertedNode = {
  project: ProjectFile;
  id: string;
};

export function createNovelProject(): ProjectFile {
  const manuscript = folderNode("Manuscript");
  const novel: ProjectFile = {
    version: 2,
    title: "Untitled Novel",
    manuscript,
    notes: folderNode(
      "Notes",
      [
        folderNode("Characters", [], false),
        folderNode("Places", [], false),
        folderNode("Misc.", [], false),
        folderNode("Research", [], false),
      ],
      false,
    ),
    publishing: arrangePublishing(
      folderNode("Publishing", [folderNode("Front Matter", [], true, "front"), folderNode("Back Matter", [], true, "back")]),
    ),
    trash: folderNode("Trash"),
    dictionary: [],
    layout: defaultPageLayout(),
    compile: defaultBookCompile(),
    view: { selectedId: manuscript.id, expanded: null },
  };
  return setView(novel, { expanded: [manuscript.id] });
}

export function setBookCompile(project: ProjectFile, compile: BookCompile): ProjectFile {
  const next = bookCompile(compile);
  if (JSON.stringify(next) === JSON.stringify(project.compile)) {
    return project;
  }
  return { ...project, compile: next };
}

export function setPageLayout(project: ProjectFile, layout: PageLayout): ProjectFile {
  const next = pageLayout(layout);
  if (
    next.font === project.layout.font &&
    next.points === project.layout.points &&
    next.align === project.layout.align
  ) {
    return project;
  }
  return { ...project, layout: next };
}

export function setView(project: ProjectFile, view: Partial<ProjectView>): ProjectFile {
  return { ...project, view: { ...project.view, ...view } };
}

export function addDictionaryWord(project: ProjectFile, word: string): ProjectFile {
  return setDictionary(project, [...project.dictionary, word]);
}

export function removeDictionaryWord(project: ProjectFile, word: string): ProjectFile {
  const key = word.toLocaleLowerCase();
  return {
    ...project,
    dictionary: project.dictionary.filter((entry) => entry.toLocaleLowerCase() !== key),
  };
}

export function setDictionary(project: ProjectFile, words: string[]): ProjectFile {
  return { ...project, dictionary: uniqueWords(words) };
}

export function parseProject(raw: string): ProjectFile | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  return parseProjectValue(value);
}

export function findNode(project: ProjectFile, id: string): LocatedNode | null {
  for (const key of ROOT_KEYS) {
    const found = search(project[key], null, id);
    if (found) {
      return { ...found, root: key };
    }
  }
  return null;
}

export function isRoot(project: ProjectFile, id: string): boolean {
  return ROOT_KEYS.some((key) => project[key].id === id);
}

export function isStoredInTrash(project: ProjectFile, id: string): boolean {
  return project.trash.children.some((child) => contains(child, id));
}

export function firstDocumentId(node: BinderNode): string | null {
  switch (node.kind) {
    case "document":
      return node.id;
    case "folder":
      for (const child of node.children) {
        const found = firstDocumentId(child);
        if (found) {
          return found;
        }
      }
      return null;
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}

export function folderIds(project: ProjectFile): string[] {
  const ids: string[] = [];
  for (const key of ROOT_KEYS) {
    collectFolderIds(project[key], ids);
  }
  return ids;
}

export function openFolders(project: ProjectFile): string[] {
  const hidden: string[] = [];
  collectFolderIds(project.trash, hidden);
  const closed = new Set(hidden);
  const source = project.view.expanded ?? folderIds(project);
  return source.filter((id) => !closed.has(id));
}

export function renameProject(project: ProjectFile, title: string): ProjectFile {
  return { ...project, title };
}

export function renameNode(project: ProjectFile, id: string, title: string): ProjectFile {
  if (isRoot(project, id)) {
    return project;
  }
  return editNode(project, id, (node) => ({ ...node, title }));
}

export function setDocumentContent(
  project: ProjectFile,
  id: string,
  content: EditorDoc,
): ProjectFile {
  return editNode(project, id, (node) => {
    switch (node.kind) {
      case "document":
        return { ...node, content };
      case "folder":
        return node;
      default: {
        const unexpected: never = node;
        return unexpected;
      }
    }
  });
}

export type LeafAction = {
  role: DocumentRole;
  label: string;
  menuLabel: string;
  hint: string;
  idle: string;
  empty: string;
};

export function leafAction(project: ProjectFile, selectedId: string | null): LeafAction {
  return leafCopy[leafRole(project, selectedId)];
}

export function manuscriptWordCount(project: ProjectFile): number {
  return treeWordCount(project.manuscript);
}

export function folderNode(
  title: string,
  children: BinderNode[] = [],
  includeInCompile = true,
  matter?: MatterPlace,
): FolderNode {
  return {
    id: crypto.randomUUID(),
    title,
    kind: "folder",
    includeInCompile,
    ...(matter ? { matter } : {}),
    children,
  };
}

export function documentNode(title: string, role: DocumentRole, content: EditorDoc = emptyDoc()): DocumentNode {
  return {
    id: crypto.randomUUID(),
    title,
    kind: "document",
    role,
    includeInCompile: role !== "note",
    content,
  };
}

export const roleForRoot: Record<RootKey, DocumentRole> = {
  manuscript: "scene",
  notes: "note",
  publishing: "page",
  trash: "scene",
};

export const leafCopy: Record<DocumentRole, LeafAction & { plural: string }> = {
  scene: {
    role: "scene",
    label: "New scene",
    menuLabel: "New Scene",
    hint: "Add a scene in this section, or just below the selected scene",
    idle: "No scene selected",
    empty: "Select a scene to write, or add one here.",
    plural: "scenes",
  },
  note: {
    role: "note",
    label: "New note",
    menuLabel: "New Note",
    hint: "Add a note in this folder, or just below the selected note",
    idle: "No note selected",
    empty: "Select a note to write, or add one here.",
    plural: "notes",
  },
  page: {
    role: "page",
    label: "New page",
    menuLabel: "New Page",
    hint: "Add a page in this section, or just below the selected page",
    idle: "No page selected",
    empty: "Select a page to write, or add one here.",
    plural: "pages",
  },
};

function leafRole(project: ProjectFile, selectedId: string | null): DocumentRole {
  if (!selectedId) {
    return "scene";
  }
  const located = findNode(project, selectedId);
  if (!located) {
    return "scene";
  }
  if (located.node.kind === "document") {
    return located.node.role;
  }
  return roleForRoot[located.root];
}

export function editNode(
  project: ProjectFile,
  id: string,
  updater: (node: BinderNode) => BinderNode,
): ProjectFile {
  const next = { ...project };
  for (const key of ROOT_KEYS) {
    const mapped = mapNode(project[key], id, updater);
    if (mapped.kind !== "folder") {
      return project;
    }
    next[key] = mapped;
  }
  return next;
}

function mapNode(
  node: BinderNode,
  id: string,
  updater: (node: BinderNode) => BinderNode,
): BinderNode {
  if (node.id === id) {
    return updater(node);
  }
  switch (node.kind) {
    case "document":
      return node;
    case "folder": {
      let changed = false;
      const children = node.children.map((child) => {
        const next = mapNode(child, id, updater);
        if (next !== child) {
          changed = true;
        }
        return next;
      });
      if (!changed) {
        return node;
      }
      return { ...node, children };
    }
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}

function search(
  node: BinderNode,
  parent: FolderNode | null,
  id: string,
): { node: BinderNode; parent: FolderNode | null } | null {
  if (node.id === id) {
    return { node, parent };
  }
  switch (node.kind) {
    case "document":
      return null;
    case "folder":
      for (const child of node.children) {
        const found = search(child, node, id);
        if (found) {
          return found;
        }
      }
      return null;
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}

export function contains(node: BinderNode, id: string): boolean {
  if (node.id === id) {
    return true;
  }
  switch (node.kind) {
    case "document":
      return false;
    case "folder":
      return node.children.some((child) => contains(child, id));
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}

function collectFolderIds(node: BinderNode, ids: string[]): void {
  switch (node.kind) {
    case "folder":
      ids.push(node.id);
      for (const child of node.children) {
        collectFolderIds(child, ids);
      }
      return;
    case "document":
      return;
    default: {
      const unexpected: never = node;
      throw new Error(`Unexpected binder node: ${String(unexpected)}`);
    }
  }
}

function treeWordCount(node: BinderNode): number {
  switch (node.kind) {
    case "document":
      return wordCount(node.content);
    case "folder":
      return node.children.reduce((sum, child) => sum + treeWordCount(child), 0);
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}

function parseProjectValue(value: unknown): ProjectFile | null {
  if (!isRecord(value) || typeof value.title !== "string") {
    return null;
  }
  if (value.version === 2) {
    return parseVersion2(value);
  }
  if (value.version === 1) {
    return migrateVersion1(value);
  }
  return null;
}

function parseVersion2(value: Record<string, unknown>): ProjectFile | null {
  if (typeof value.title !== "string") {
    return null;
  }
  const roots = {} as Pick<ProjectFile, RootKey>;
  for (const key of ROOT_KEYS) {
    const node = parseBinderNode(value[key], true);
    if (!node || node.kind !== "folder") {
      return null;
    }
    roots[key] = node;
  }
  return {
    version: 2,
    title: value.title,
    ...roots,
    publishing: roots.publishing,
    dictionary: parseDictionary(value.dictionary),
    layout: pageLayout(value.layout),
    compile: bookCompile(value.compile),
    view: parseView(value.view),
  };
}

function migrateVersion1(value: Record<string, unknown>): ProjectFile | null {
  const manuscript = parseBinderNode(value.manuscript, false);
  const characters = parseBinderNode(value.characters, false);
  const places = parseBinderNode(value.places, false);
  const frontMatter = parseBinderNode(value.frontMatter, false);
  const research = parseBinderNode(value.research, false);
  const trash = parseBinderNode(value.trash, false);
  if (
    typeof value.title !== "string" ||
    manuscript?.kind !== "folder" ||
    characters?.kind !== "folder" ||
    places?.kind !== "folder" ||
    frontMatter?.kind !== "folder" ||
    research?.kind !== "folder" ||
    trash?.kind !== "folder"
  ) {
    return null;
  }
  return {
    version: 2,
    title: value.title,
    manuscript: assignFolder(manuscript, "scene", null),
    notes: folderNode(
      "Notes",
      [
        assignFolder(characters, "note", false),
        assignFolder(places, "note", false),
        folderNode("Misc.", [], false),
        assignFolder(research, "note", false),
      ],
      false,
    ),
    publishing: arrangePublishing(
      folderNode("Publishing", [
        assignFolder(frontMatter, "page", true),
        folderNode("Back Matter"),
        documentNode("Acknowledgements", "page"),
        documentNode("About the Author", "page"),
        documentNode("Synopsis", "page"),
        documentNode("Back page", "page"),
      ]),
    ),
    trash: assignFolder(trash, "scene", null),
    dictionary: [],
    layout: defaultPageLayout(),
    compile: defaultBookCompile(),
    view: { selectedId: null, expanded: null },
  };
}

const frontPages = ["Title page", "Copyright", "Dedication", "Epigraph"];
const backPages = ["Acknowledgements", "About the Author"];
const publishingPages = ["Synopsis", "Query", "Back page"];

function arrangePublishing(publishing: FolderNode): FolderNode {
  const front = matterFolder(publishing, "front") ?? folderNode("Front Matter", [], true, "front");
  const back = matterFolder(publishing, "back") ?? folderNode("Back Matter", [], true, "back");
  const loose = publishing.children.filter((child) => child.id !== front.id && child.id !== back.id);
  const used = new Set<string>();
  const nextFront = nestPages(front, frontPages, loose, used);
  const nextBack = nestPages(back, backPages, loose, used);
  const beside = publishingPages.map((title) => claimPage(title, [loose], used));
  const rest = loose.filter((child) => !used.has(child.id));
  return {
    ...publishing,
    children: [{ ...nextFront, matter: "front" }, { ...nextBack, matter: "back" }, ...beside, ...rest],
  };
}

function matterFolder(folder: FolderNode, matter: MatterPlace): FolderNode | null {
  const marked = folder.children.find((child) => child.kind === "folder" && child.matter === matter);
  if (marked?.kind === "folder") {
    return marked;
  }
  return folderChild(folder, matterTitle(matter));
}

function folderChild(folder: FolderNode, title: string): FolderNode | null {
  const found = folder.children.find((child) => child.kind === "folder" && child.title === title);
  return found?.kind === "folder" ? found : null;
}

function nestPages(
  folder: FolderNode,
  titles: string[],
  pool: BinderNode[],
  used: Set<string>,
): FolderNode {
  const pages: BinderNode[] = [];
  const kept = new Set<string>();
  for (const title of titles) {
    const page = claimPage(title, [folder.children, pool], used);
    pages.push(page);
    kept.add(page.id);
  }
  for (const child of folder.children) {
    if (!kept.has(child.id) && !used.has(child.id)) {
      pages.push(child);
      used.add(child.id);
    }
  }
  return { ...folder, children: pages };
}

function claimPage(title: string, groups: BinderNode[][], used: Set<string>): BinderNode {
  for (const group of groups) {
    const found = group.find((child) => child.title === title && !used.has(child.id));
    if (found) {
      used.add(found.id);
      return found;
    }
  }
  const created = documentNode(title, "page", publishingStarter(title) ?? emptyDoc());
  used.add(created.id);
  return created;
}

function assignFolder(node: FolderNode, role: DocumentRole, compile: boolean | null): FolderNode {
  return {
    ...node,
    includeInCompile: compile ?? node.includeInCompile,
    children: node.children.map((child) => assignRole(child, role, compile)),
  };
}

export function assignRole(
  node: BinderNode,
  role: DocumentRole,
  compile: boolean | null,
): BinderNode {
  switch (node.kind) {
    case "document":
      return { ...node, role, includeInCompile: compile ?? node.includeInCompile };
    case "folder":
      return {
        ...node,
        includeInCompile: compile ?? node.includeInCompile,
        children: node.children.map((child) => assignRole(child, role, compile)),
      };
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}

export function replaceMatter(project: ProjectFile, section: MatterPlace, pages: BinderNode[]): ProjectFile {
  const target = matterFolder(project.publishing, section);
  if (!target) {
    return project;
  }
  return {
    ...project,
    publishing: {
      ...project.publishing,
      children: project.publishing.children.map((child) =>
        child.id === target.id
          ? { ...child, matter: section, children: pages.map((page) => assignRole(page, "page", null)) }
          : child,
      ),
    },
  };
}

function matterTitle(section: MatterPlace): string {
  switch (section) {
    case "front":
      return "Front Matter";
    case "back":
      return "Back Matter";
    default: {
      const unexpected: never = section;
      return unexpected;
    }
  }
}

function parseView(value: unknown): ProjectView {
  if (!isRecord(value)) {
    return { selectedId: null, expanded: null };
  }
  const selectedId = typeof value.selectedId === "string" ? value.selectedId : null;
  const expanded = Array.isArray(value.expanded)
    ? value.expanded.filter((id): id is string => typeof id === "string")
    : null;
  return { selectedId, expanded };
}

function parseOrigin(value: unknown): TrashOrigin | undefined {
  if (!isRecord(value) || typeof value.parentId !== "string" || typeof value.index !== "number") {
    return undefined;
  }
  if (!isLivingRoot(value.root)) {
    return undefined;
  }
  return { parentId: value.parentId, index: value.index, root: value.root };
}

function isLivingRoot(value: unknown): value is Exclude<RootKey, "trash"> {
  return value === "manuscript" || value === "notes" || value === "publishing";
}

function parseDictionary(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueWords(value.filter((word): word is string => typeof word === "string"));
}

function parseRole(value: unknown): DocumentRole | null {
  switch (value) {
    case "scene":
    case "note":
    case "page":
      return value;
    default:
      return null;
  }
}

function parseBinderNode(value: unknown, requireRole: boolean): BinderNode | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") {
    return null;
  }
  if (typeof value.includeInCompile !== "boolean") {
    return null;
  }
  const origin = parseOrigin(value.origin);
  const fields = {
    id: value.id,
    title: value.title,
    includeInCompile: value.includeInCompile,
    ...(origin ? { origin } : {}),
  };
  switch (value.kind) {
    case "folder": {
      if (!Array.isArray(value.children)) {
        return null;
      }
      const children: BinderNode[] = [];
      for (const child of value.children) {
        const parsed = parseBinderNode(child, requireRole);
        if (!parsed) {
          return null;
        }
        children.push(parsed);
      }
      const matter = parseMatter(value.matter) ?? matterFromTitle(value.title);
      return { ...fields, kind: "folder", children, ...(matter ? { matter } : {}) };
    }
    case "document": {
      const content = value.content == null ? emptyDoc() : parseEditorDoc(value.content);
      const role = parseRole(value.role) ?? (requireRole ? null : "scene");
      if (!content || !role) {
        return null;
      }
      return { ...fields, kind: "document", role, content };
    }
    default:
      return null;
  }
}

function parseMatter(value: unknown): MatterPlace | null {
  switch (value) {
    case "front":
    case "back":
      return value;
    default:
      return null;
  }
}

function matterFromTitle(title: string): MatterPlace | null {
  switch (title) {
    case "Front Matter":
      return "front";
    case "Back Matter":
      return "back";
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
