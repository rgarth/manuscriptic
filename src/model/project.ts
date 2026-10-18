export type BinderKind = "folder" | "document";

export type EditorBlock = {
  type: string;
  text?: string;
  content?: EditorBlock[];
};

export type EditorDoc = {
  type: "doc";
  content?: EditorBlock[];
};

export type BinderNode = {
  id: string;
  title: string;
  kind: BinderKind;
  includeInCompile: boolean;
  children: BinderNode[];
  content: EditorDoc | null;
};

export const ROOT_KEYS = [
  "manuscript",
  "characters",
  "places",
  "frontMatter",
  "research",
  "trash",
] as const;

export type RootKey = (typeof ROOT_KEYS)[number];

export type ProjectFile = {
  version: 1;
  title: string;
  manuscript: BinderNode;
  characters: BinderNode;
  places: BinderNode;
  frontMatter: BinderNode;
  research: BinderNode;
  trash: BinderNode;
};

export type LocatedNode = {
  node: BinderNode;
  parent: BinderNode | null;
  root: RootKey;
};

export function emptyDoc(): EditorDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

export function createNovelProject(): ProjectFile {
  const opening = documentNode("Opening");
  const chapter = folderNode("Chapter One", [opening]);
  return {
    version: 1,
    title: "Untitled Novel",
    manuscript: folderNode("Manuscript", [chapter]),
    characters: folderNode("Characters"),
    places: folderNode("Places"),
    frontMatter: folderNode("Front Matter"),
    research: folderNode("Research"),
    trash: folderNode("Trash"),
  };
}

export function parseProject(raw: string): ProjectFile | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isProjectFile(value)) {
    return null;
  }
  return value;
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
      const unexpected: never = node.kind;
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

export function renameNode(
  project: ProjectFile,
  id: string,
  title: string,
): ProjectFile {
  return editNode(project, id, (node) => ({ ...node, title }));
}

export function setDocumentContent(
  project: ProjectFile,
  id: string,
  content: EditorDoc,
): ProjectFile {
  return editNode(project, id, (node) => ({ ...node, content }));
}

export function addScene(project: ProjectFile, selectedId: string | null): ProjectFile {
  const scene = documentNode("New scene");
  return insertChild(project, destinationId(project, selectedId), scene);
}

export function addFolder(project: ProjectFile, selectedId: string | null): ProjectFile {
  const folder = folderNode("New folder");
  return insertChild(project, destinationId(project, selectedId), folder);
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
  return editNode(removed.project, removed.project.trash.id, (trash) => ({
    ...trash,
    children: [...trash.children, node],
  }));
}

export function deleteForever(project: ProjectFile, id: string): ProjectFile {
  if (isRoot(project, id) || !isStoredInTrash(project, id)) {
    return project;
  }
  return removeFromProject(project, id).project;
}

export function wordCount(doc: EditorDoc | null): number {
  const text = docText(doc).trim();
  if (!text) {
    return 0;
  }
  return text.split(/\s+/).length;
}

export function manuscriptWordCount(project: ProjectFile): number {
  return treeWordCount(project.manuscript);
}

function folderNode(title: string, children: BinderNode[] = []): BinderNode {
  return {
    id: crypto.randomUUID(),
    title,
    kind: "folder",
    includeInCompile: true,
    children,
    content: null,
  };
}

function documentNode(title: string): BinderNode {
  return {
    id: crypto.randomUUID(),
    title,
    kind: "document",
    includeInCompile: true,
    children: [],
    content: emptyDoc(),
  };
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
      const unexpected: never = located.node.kind;
      return unexpected;
    }
  }
}

function insertChild(
  project: ProjectFile,
  parentId: string,
  child: BinderNode,
): ProjectFile {
  const parent = findNode(project, parentId);
  if (!parent || parent.node.kind !== "folder") {
    return project;
  }
  return editNode(project, parentId, (node) => ({
    ...node,
    children: [...node.children, child],
  }));
}

function editNode(
  project: ProjectFile,
  id: string,
  updater: (node: BinderNode) => BinderNode,
): ProjectFile {
  const next = { ...project };
  for (const key of ROOT_KEYS) {
    next[key] = mapNode(project[key], id, updater);
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

function removeFromProject(
  project: ProjectFile,
  id: string,
): { project: ProjectFile; node: BinderNode | null } {
  const next = { ...project };
  let removed: BinderNode | null = null;
  for (const key of ROOT_KEYS) {
    const result = removeNode(project[key], id);
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

function search(
  node: BinderNode,
  parent: BinderNode | null,
  id: string,
): { node: BinderNode; parent: BinderNode | null } | null {
  if (node.id === id) {
    return { node, parent };
  }
  for (const child of node.children) {
    const found = search(child, node, id);
    if (found) {
      return found;
    }
  }
  return null;
}

function contains(node: BinderNode, id: string): boolean {
  if (node.id === id) {
    return true;
  }
  return node.children.some((child) => contains(child, id));
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
      const unexpected: never = node.kind;
      throw new Error(`Unexpected binder kind: ${String(unexpected)}`);
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
      const unexpected: never = node.kind;
      return unexpected;
    }
  }
}

function docText(doc: EditorDoc | null): string {
  if (!doc?.content) {
    return "";
  }
  return doc.content.map((block) => blockText(block)).join("\n");
}

function blockText(node: EditorBlock): string {
  const own = node.text ?? "";
  const children = (node.content ?? []).map((child) => blockText(child)).join("");
  return own + children;
}

function isProjectFile(value: unknown): value is ProjectFile {
  if (!isRecord(value)) {
    return false;
  }
  if (value.version !== 1 || typeof value.title !== "string") {
    return false;
  }
  return ROOT_KEYS.every((key) => isBinderNode(value[key]));
}

function isBinderNode(value: unknown): value is BinderNode {
  if (!isRecord(value)) {
    return false;
  }
  if (typeof value.id !== "string" || typeof value.title !== "string") {
    return false;
  }
  if (value.kind !== "folder" && value.kind !== "document") {
    return false;
  }
  if (typeof value.includeInCompile !== "boolean") {
    return false;
  }
  if (!Array.isArray(value.children) || !value.children.every(isBinderNode)) {
    return false;
  }
  if (value.content === null) {
    return true;
  }
  return isEditorDoc(value.content);
}

function isEditorDoc(value: unknown): value is EditorDoc {
  if (!isRecord(value) || value.type !== "doc") {
    return false;
  }
  return value.content === undefined || Array.isArray(value.content);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
