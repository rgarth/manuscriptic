import { applyHunks, diffLines, type Hunk } from "./lineDiff.ts";
import type { EditorDoc } from "./model/editorDoc.ts";
import {
  parseProject,
  setDocumentContent,
  type BinderNode,
  type DocumentNode,
  type ProjectFile,
} from "./model/project.ts";
import { decodeScene, encodeScene } from "./sceneText.ts";

export type BookFiles = Record<string, string>;

export type FileChange = {
  path: string;
  hunks: Hunk[];
};

export type SnapshotKind = "manual" | "auto";

export type Snapshot = {
  id: string;
  at: number;
  kind: SnapshotKind;
  changes: FileChange[];
};

export type BookHistory = {
  checkpoint: BookFiles;
  snapshots: Snapshot[];
};

const binderPath = "binder.json";
const historyPath = "history.json";

export function scenePath(id: string): string {
  return `scenes/${id}.prose`;
}

export function filesForBook(project: ProjectFile): BookFiles {
  const files: BookFiles = {
    [binderPath]: `${JSON.stringify(binderValue(project), null, 2)}\n`,
  };
  for (const document of documentsIn(project)) {
    files[scenePath(document.id)] = encodeScene(document.content);
  }
  return files;
}

export function bookFromFiles(files: BookFiles): ProjectFile | null {
  const binder = files[binderPath];
  if (!binder) {
    return null;
  }
  const project = parseProject(binder);
  if (!project) {
    return null;
  }
  let next = project;
  for (const document of documentsIn(project)) {
    const text = files[scenePath(document.id)];
    if (text === undefined) {
      return null;
    }
    const content = decodeScene(text);
    if (!content) {
      return null;
    }
    next = setDocumentContent(next, document.id, content);
  }
  return next;
}

export function emptyHistory(files: BookFiles): BookHistory {
  return { checkpoint: { ...files }, snapshots: [] };
}

export function historyFromFiles(files: BookFiles): BookHistory | null {
  const raw = files[historyPath];
  if (!raw) {
    const book = withoutHistory(files);
    return emptyHistory(book);
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || !isRecord(value.checkpoint) || !Array.isArray(value.snapshots)) {
    return null;
  }
  const checkpoint: BookFiles = {};
  for (const [path, text] of Object.entries(value.checkpoint)) {
    if (typeof text !== "string" || !safePath(path)) {
      return null;
    }
    checkpoint[path] = text;
  }
  const snapshots: Snapshot[] = [];
  for (const entry of value.snapshots) {
    const snapshot = parseSnapshot(entry);
    if (!snapshot) {
      return null;
    }
    snapshots.push(snapshot);
  }
  return { checkpoint, snapshots };
}

export function withHistory(files: BookFiles, history: BookHistory): BookFiles {
  return {
    ...withoutHistory(files),
    [historyPath]: `${JSON.stringify({ checkpoint: history.checkpoint, snapshots: history.snapshots }, null, 2)}\n`,
  };
}

export function takeSnapshot(
  history: BookHistory,
  files: BookFiles,
  kind: SnapshotKind,
  at: number,
  id: string,
): BookHistory {
  const changes = diffFiles(replay(history), files);
  if (changes.length === 0) {
    return history;
  }
  const next = {
    checkpoint: history.checkpoint,
    snapshots: [...history.snapshots, { id, at, kind, changes }],
  };
  return kind === "auto" ? thinHistory(next, at) : next;
}

export function deleteSnapshot(history: BookHistory, id: string): BookHistory {
  const index = history.snapshots.findIndex((snapshot) => snapshot.id === id);
  if (index < 0) {
    return history;
  }
  return foldOut(history, index);
}

export function replay(history: BookHistory, through?: number): BookFiles {
  let files = { ...history.checkpoint };
  const end = through === undefined ? history.snapshots.length : through + 1;
  for (const snapshot of history.snapshots.slice(0, end)) {
    files = applyChanges(files, snapshot.changes);
  }
  return files;
}

export function bookAt(history: BookHistory, index: number): ProjectFile | null {
  return bookFromFiles(replay(history, index));
}

export function sceneAt(history: BookHistory, index: number, id: string): EditorDoc | null {
  const text = replay(history, index)[scenePath(id)];
  if (text === undefined) {
    return null;
  }
  return decodeScene(text);
}

export function thinHistory(history: BookHistory, now: number): BookHistory {
  const keep = new Set(history.snapshots.filter((snapshot) => keepSnapshot(snapshot, history.snapshots, now)).map((snapshot) => snapshot.id));
  let next = history;
  for (const snapshot of history.snapshots) {
    if (!keep.has(snapshot.id)) {
      const index = next.snapshots.findIndex((item) => item.id === snapshot.id);
      if (index >= 0) {
        next = foldOut(next, index);
      }
    }
  }
  return next;
}

function keepSnapshot(snapshot: Snapshot, all: Snapshot[], now: number): boolean {
  if (snapshot.kind === "manual") {
    return true;
  }
  const age = now - snapshot.at;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  if (age <= hour) {
    return true;
  }
  if (age <= day) {
    return newestInBucket(snapshot, all, now, hour, day, (at) => Math.floor(at / hour));
  }
  if (age <= 30 * day) {
    return newestInBucket(snapshot, all, now, day, 30 * day, (at) => Math.floor(at / day));
  }
  return false;
}

function newestInBucket(
  snapshot: Snapshot,
  all: Snapshot[],
  now: number,
  minAge: number,
  maxAge: number,
  bucket: (at: number) => number,
): boolean {
  const key = bucket(snapshot.at);
  const peers = all.filter(
    (item) =>
      item.kind === "auto" &&
      now - item.at > minAge &&
      now - item.at <= maxAge &&
      bucket(item.at) === key,
  );
  const newest = peers.reduce((best, item) => (item.at > best.at ? item : best), peers[0]);
  return newest?.id === snapshot.id;
}

function foldOut(history: BookHistory, index: number): BookHistory {
  const snapshot = history.snapshots[index];
  if (!snapshot) {
    return history;
  }
  if (index === 0) {
    return {
      checkpoint: applyChanges(history.checkpoint, snapshot.changes),
      snapshots: history.snapshots.slice(1),
    };
  }
  const previous = history.snapshots[index - 1];
  if (!previous) {
    return history;
  }
  const base = replay(history, index - 2);
  const after = applyChanges(applyChanges(base, previous.changes), snapshot.changes);
  const merged: Snapshot = { ...previous, changes: diffFiles(base, after) };
  return {
    checkpoint: history.checkpoint,
    snapshots: [...history.snapshots.slice(0, index - 1), merged, ...history.snapshots.slice(index + 1)],
  };
}

function diffFiles(before: BookFiles, after: BookFiles): FileChange[] {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const changes: FileChange[] = [];
  for (const path of paths) {
    const previous = before[path] ?? "";
    const next = after[path] ?? "";
    if (previous === next) {
      continue;
    }
    changes.push({ path, hunks: diffLines(previous, next) });
  }
  return changes;
}

function applyChanges(files: BookFiles, changes: FileChange[]): BookFiles {
  const next = { ...files };
  for (const change of changes) {
    const text = applyHunks(next[change.path] ?? "", change.hunks);
    if (text.length === 0) {
      delete next[change.path];
    } else {
      next[change.path] = text;
    }
  }
  return next;
}

function withoutHistory(files: BookFiles): BookFiles {
  const next = { ...files };
  delete next[historyPath];
  return next;
}

function binderValue(project: ProjectFile): unknown {
  return {
    version: project.version,
    title: project.title,
    dictionary: project.dictionary,
    layout: project.layout,
    view: project.view,
    manuscript: binderNode(project.manuscript),
    notes: binderNode(project.notes),
    publishing: binderNode(project.publishing),
    trash: binderNode(project.trash),
  };
}

function binderNode(node: BinderNode): unknown {
  const shared = {
    id: node.id,
    title: node.title,
    includeInCompile: node.includeInCompile,
    ...(node.origin ? { origin: node.origin } : {}),
  };
  switch (node.kind) {
    case "folder":
      return { ...shared, kind: "folder", children: node.children.map((child) => binderNode(child)) };
    case "document":
      return { ...shared, kind: "document", role: node.role };
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}

function documentsIn(project: ProjectFile): DocumentNode[] {
  return [
    ...walk(project.manuscript),
    ...walk(project.notes),
    ...walk(project.publishing),
    ...walk(project.trash),
  ];
}

function walk(node: BinderNode): DocumentNode[] {
  switch (node.kind) {
    case "document":
      return [node];
    case "folder":
      return node.children.flatMap((child) => walk(child));
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}

function parseSnapshot(value: unknown): Snapshot | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.at !== "number" || !Array.isArray(value.changes)) {
    return null;
  }
  if (value.kind !== "manual" && value.kind !== "auto") {
    return null;
  }
  const changes: FileChange[] = [];
  for (const change of value.changes) {
    if (!isRecord(change) || typeof change.path !== "string" || !safePath(change.path) || !Array.isArray(change.hunks)) {
      return null;
    }
    const hunks: Hunk[] = [];
    for (const hunk of change.hunks) {
      if (!isRecord(hunk) || typeof hunk.at !== "number" || !stringList(hunk.remove) || !stringList(hunk.insert)) {
        return null;
      }
      hunks.push({ at: hunk.at, remove: hunk.remove, insert: hunk.insert });
    }
    changes.push({ path: change.path, hunks });
  }
  return { id: value.id, at: value.at, kind: value.kind, changes };
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function safePath(path: string): boolean {
  return path.length > 0 && !path.startsWith("/") && !path.split("/").includes("..");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
