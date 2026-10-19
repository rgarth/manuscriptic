import { uniqueWords } from "../dictionary.ts";
import { emptyDoc, parseEditorDoc, wordCount, type EditorDoc } from "./editorDoc.ts";

type BinderFields = {
  id: string;
  title: string;
  includeInCompile: boolean;
};

export type FolderNode = BinderFields & {
  kind: "folder";
  children: BinderNode[];
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

export type ProjectFile = {
  version: 2;
  title: string;
  manuscript: FolderNode;
  notes: FolderNode;
  publishing: FolderNode;
  trash: FolderNode;
  dictionary: string[];
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
  const opening = documentNode("Opening", "scene");
  const chapter = folderNode("Chapter One", [opening]);
  return {
    version: 2,
    title: "Untitled Novel",
    manuscript: folderNode("Manuscript", [chapter]),
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
      folderNode("Publishing", [folderNode("Front Matter"), folderNode("Back Matter")]),
    ),
    trash: folderNode("Trash"),
    dictionary: [],
  };
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

export function renameProject(project: ProjectFile, title: string): ProjectFile {
  return { ...project, title };
}

export function renameNode(project: ProjectFile, id: string, title: string): ProjectFile {
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

export function addLeaf(project: ProjectFile, selectedId: string | null): InsertedNode {
  const action = leafAction(project, selectedId);
  return addNode(project, selectedId, documentNode(action.label, action.role));
}

export function addSection(project: ProjectFile, selectedId: string | null): InsertedNode {
  return addNode(project, selectedId, folderNode("New section"));
}

export type Removal = {
  action: "move" | "delete";
  title: string;
  folder: boolean;
  label: string;
  message: string;
};

export function removal(project: ProjectFile, id: string): Removal | null {
  if (isRoot(project, id)) {
    return null;
  }
  const located = findNode(project, id);
  if (!located) {
    return null;
  }
  const title = located.node.title;
  const folder = located.node.kind === "folder";
  if (isStoredInTrash(project, id)) {
    return {
      action: "delete",
      title,
      folder,
      label: "Delete",
      message: folder
        ? `Delete “${title}” and everything inside it? This cannot be undone.`
        : `Delete “${title}”? This cannot be undone.`,
    };
  }
  const plural = leafCopy[roleForRoot[located.root]].plural;
  return {
    action: "move",
    title,
    folder,
    label: "Move to Trash",
    message: folder
      ? `Move “${title}” to the trash? Its sections and ${plural} move with it.`
      : `Move “${title}” to the trash?`,
  };
}

export function moveToTrash(project: ProjectFile, id: string): ProjectFile {
  if (isRoot(project, id) || isStoredInTrash(project, id)) {
    return project;
  }
  const removed = removeFromProject(project, id);
  const node = removed.node;
  if (!node) {
    return project;
  }
  return editNode(removed.project, removed.project.trash.id, (trash) => {
    switch (trash.kind) {
      case "folder":
        return { ...trash, children: [...trash.children, node] };
      case "document":
        return trash;
      default: {
        const unexpected: never = trash;
        return unexpected;
      }
    }
  });
}

export function deleteForever(project: ProjectFile, id: string): ProjectFile {
  if (isRoot(project, id) || !isStoredInTrash(project, id)) {
    return project;
  }
  return removeFromProject(project, id).project;
}

export function manuscriptWordCount(project: ProjectFile): number {
  return treeWordCount(project.manuscript);
}

function folderNode(
  title: string,
  children: BinderNode[] = [],
  includeInCompile = true,
): FolderNode {
  return {
    id: crypto.randomUUID(),
    title,
    kind: "folder",
    includeInCompile,
    children,
  };
}

function documentNode(title: string, role: DocumentRole): DocumentNode {
  return {
    id: crypto.randomUUID(),
    title,
    kind: "document",
    role,
    includeInCompile: role !== "note",
    content: emptyDoc(),
  };
}

const roleForRoot: Record<RootKey, DocumentRole> = {
  manuscript: "scene",
  notes: "note",
  publishing: "page",
  trash: "scene",
};

const leafCopy: Record<DocumentRole, LeafAction & { plural: string }> = {
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

function addNode(project: ProjectFile, selectedId: string | null, child: BinderNode): InsertedNode {
  const located = selectedId ? findNode(project, selectedId) : null;
  const afterId =
    child.kind === "document" && located?.node.kind === "document" ? located.node.id : undefined;
  const parentId =
    located && afterId && located.parent
      ? located.parent.id
      : destinationId(project, selectedId);
  const next = insertChild(project, parentId, child, afterId);
  if (!next) {
    throw new Error("Could not insert into the binder.");
  }
  return { project: next, id: child.id };
}

function destinationId(project: ProjectFile, selectedId: string | null): string {
  if (!selectedId) {
    return project.manuscript.id;
  }
  const located = findNode(project, selectedId);
  if (!located) {
    return project.manuscript.id;
  }
  switch (located.node.kind) {
    case "folder":
      return located.node.id;
    case "document":
      return located.parent?.id ?? project.manuscript.id;
    default: {
      const unexpected: never = located.node;
      return unexpected;
    }
  }
}

function insertChild(
  project: ProjectFile,
  parentId: string,
  child: BinderNode,
  afterId?: string,
): ProjectFile | null {
  const parent = findNode(project, parentId);
  if (!parent || parent.node.kind !== "folder") {
    return null;
  }
  return editNode(project, parentId, (node) => {
    switch (node.kind) {
      case "folder": {
        const children = [...node.children];
        const after = afterId ? children.findIndex((item) => item.id === afterId) : -1;
        if (after >= 0) {
          children.splice(after + 1, 0, child);
        } else {
          children.push(child);
        }
        return { ...node, children };
      }
      case "document":
        return node;
      default: {
        const unexpected: never = node;
        return unexpected;
      }
    }
  });
}

function editNode(
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

function removeFromProject(
  project: ProjectFile,
  id: string,
): { project: ProjectFile; node: BinderNode | null } {
  const next = { ...project };
  let removed: BinderNode | null = null;
  for (const key of ROOT_KEYS) {
    const result = removeNode(project[key], id);
    if (result.node.kind !== "folder") {
      return { project, node: null };
    }
    next[key] = result.node;
    if (result.removed) {
      removed = result.removed;
    }
  }
  return { project: next, node: removed };
}

function removeNode(
  node: BinderNode,
  id: string,
): { node: BinderNode; removed: BinderNode | null } {
  switch (node.kind) {
    case "document":
      return { node, removed: null };
    case "folder": {
      let removed: BinderNode | null = null;
      const children: BinderNode[] = [];
      let changed = false;
      for (const child of node.children) {
        if (child.id === id) {
          removed = child;
          changed = true;
          continue;
        }
        const nested = removeNode(child, id);
        if (nested.removed) {
          removed = nested.removed;
          changed = true;
        }
        children.push(nested.node);
      }
      if (!changed) {
        return { node, removed: null };
      }
      return { node: { ...node, children }, removed };
    }
    default: {
      const unexpected: never = node;
      return { node: unexpected, removed: null };
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

function contains(node: BinderNode, id: string): boolean {
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
    publishing: arrangePublishing(roots.publishing),
    dictionary: parseDictionary(value.dictionary),
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
  };
}

const frontPages = ["Title page", "Copyright", "Dedication", "Epigraph"];
const backPages = ["Acknowledgements", "About the Author"];
const publishingPages = ["Synopsis", "Back page"];

function arrangePublishing(publishing: FolderNode): FolderNode {
  const loose = publishing.children.filter(
    (child) => child.title !== "Front Matter" && child.title !== "Back Matter",
  );
  const front = folderChild(publishing, "Front Matter") ?? folderNode("Front Matter");
  const back = folderChild(publishing, "Back Matter") ?? folderNode("Back Matter");
  const used = new Set<string>();
  const nextFront = nestPages(front, frontPages, loose, used);
  const nextBack = nestPages(back, backPages, loose, used);
  const beside = publishingPages.map((title) => claimPage(title, [loose], used));
  const rest = loose.filter((child) => !used.has(child.id));
  return { ...publishing, children: [nextFront, nextBack, ...beside, ...rest] };
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
  const created = documentNode(title, "page");
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

function assignRole(
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
  const fields = {
    id: value.id,
    title: value.title,
    includeInCompile: value.includeInCompile,
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
      return { ...fields, kind: "folder", children };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
