export type Mark = { type: "bold" } | { type: "italic" };

export type TextRun = {
  type: "text";
  text: string;
  marks?: Mark[];
};

export type Paragraph = {
  type: "paragraph";
  content?: TextRun[];
};

export type EditorDoc = {
  type: "doc";
  content: Paragraph[];
};

type BinderFields = {
  id: string;
  title: string;
  includeInCompile: boolean;
};

export type FolderNode = BinderFields & {
  kind: "folder";
  children: BinderNode[];
};

export type DocumentNode = BinderFields & {
  kind: "document";
  content: EditorDoc;
};

export type BinderNode = FolderNode | DocumentNode;

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
  manuscript: FolderNode;
  characters: FolderNode;
  places: FolderNode;
  frontMatter: FolderNode;
  research: FolderNode;
  trash: FolderNode;
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
  return parseProjectValue(value);
}

export function parseEditorDoc(value: unknown): EditorDoc | null {
  if (!isRecord(value) || value.type !== "doc") {
    return null;
  }
  if (value.content === undefined) {
    return { type: "doc", content: [] };
  }
  if (!Array.isArray(value.content)) {
    return null;
  }
  const content: Paragraph[] = [];
  for (const block of value.content) {
    const paragraph = parseParagraph(block);
    if (!paragraph) {
      return null;
    }
    content.push(paragraph);
  }
  return { type: "doc", content };
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

export function addScene(project: ProjectFile, selectedId: string | null): InsertedNode {
  return addNode(project, selectedId, documentNode("New scene"));
}

export function addFolder(project: ProjectFile, selectedId: string | null): InsertedNode {
  return addNode(project, selectedId, folderNode("New folder"));
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

export function wordCount(doc: EditorDoc): number {
  const text = docText(doc).trim();
  if (!text) {
    return 0;
  }
  return text.split(/\s+/).length;
}

export function manuscriptWordCount(project: ProjectFile): number {
  return treeWordCount(project.manuscript);
}

function folderNode(title: string, children: BinderNode[] = []): FolderNode {
  return {
    id: crypto.randomUUID(),
    title,
    kind: "folder",
    includeInCompile: true,
    children,
  };
}

function documentNode(title: string): DocumentNode {
  return {
    id: crypto.randomUUID(),
    title,
    kind: "document",
    includeInCompile: true,
    content: emptyDoc(),
  };
}

function addNode(project: ProjectFile, selectedId: string | null, child: BinderNode): InsertedNode {
  const next = insertChild(project, destinationId(project, selectedId), child);
  return { project: next ?? project, id: child.id };
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

function insertChild(project: ProjectFile, parentId: string, child: BinderNode): ProjectFile | null {
  const parent = findNode(project, parentId);
  if (!parent || parent.node.kind !== "folder") {
    return null;
  }
  return editNode(project, parentId, (node) => {
    switch (node.kind) {
      case "folder":
        return { ...node, children: [...node.children, child] };
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

function docText(doc: EditorDoc): string {
  return doc.content
    .map((paragraph) => (paragraph.content ?? []).map((run) => run.text).join(""))
    .join("\n");
}

function parseProjectValue(value: unknown): ProjectFile | null {
  if (!isRecord(value) || value.version !== 1 || typeof value.title !== "string") {
    return null;
  }
  const roots = {} as Pick<ProjectFile, RootKey>;
  for (const key of ROOT_KEYS) {
    const node = parseBinderNode(value[key]);
    if (!node || node.kind !== "folder") {
      return null;
    }
    roots[key] = node;
  }
  return { version: 1, title: value.title, ...roots };
}

function parseBinderNode(value: unknown): BinderNode | null {
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
        const parsed = parseBinderNode(child);
        if (!parsed) {
          return null;
        }
        children.push(parsed);
      }
      return { ...fields, kind: "folder", children };
    }
    case "document": {
      const content = value.content == null ? emptyDoc() : parseEditorDoc(value.content);
      if (!content) {
        return null;
      }
      return { ...fields, kind: "document", content };
    }
    default:
      return null;
  }
}

function parseParagraph(value: unknown): Paragraph | null {
  if (!isRecord(value) || value.type !== "paragraph") {
    return null;
  }
  if (value.content === undefined) {
    return { type: "paragraph" };
  }
  if (!Array.isArray(value.content)) {
    return null;
  }
  const content: TextRun[] = [];
  for (const child of value.content) {
    const run = parseTextRun(child);
    if (!run) {
      return null;
    }
    content.push(run);
  }
  return { type: "paragraph", content };
}

function parseTextRun(value: unknown): TextRun | null {
  if (!isRecord(value) || value.type !== "text" || typeof value.text !== "string") {
    return null;
  }
  const marks = parseMarks(value.marks);
  if (!marks) {
    return null;
  }
  if (marks.length === 0) {
    return { type: "text", text: value.text };
  }
  return { type: "text", text: value.text, marks };
}

function parseMarks(value: unknown): Mark[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const marks: Mark[] = [];
  for (const mark of value) {
    if (!isRecord(mark)) {
      return null;
    }
    switch (mark.type) {
      case "bold":
        marks.push({ type: "bold" });
        break;
      case "italic":
        marks.push({ type: "italic" });
        break;
      default:
        return null;
    }
  }
  return marks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
