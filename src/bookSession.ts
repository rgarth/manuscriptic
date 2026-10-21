import {
  bookAt,
  bookFromFiles,
  deleteSnapshot,
  emptyHistory,
  filesForBook,
  historyFromFiles,
  sceneAt,
  takeSnapshot,
  withHistory,
  type BookFiles,
  type BookHistory,
  type SnapshotKind,
} from "./bookArchive.ts";
import { bookFileName } from "./filePrefs.ts";
import {
  createNovelProject,
  renameProject,
  setDocumentContent,
  type ProjectFile,
} from "./model/project.ts";

export type { BookHistory };

export type OpenBook = {
  project: ProjectFile;
  history: BookHistory;
};

export type NewBook = OpenBook & {
  title: string;
  fileName: string;
  files: BookFiles;
};

export type BookRestore =
  | { kind: "absent" }
  | { kind: "unreadable" }
  | { kind: "ready"; project: ProjectFile };

export type SceneRestore =
  | { kind: "notice"; message: string }
  | { kind: "ready"; project: ProjectFile };

export function bookFromArchive(files: BookFiles): OpenBook {
  const history = historyFromFiles(files);
  const project = bookFromFiles(files);
  if (!history || !project) {
    throw new Error("That book could not be read.");
  }
  return { project, history };
}

export function importedBook(project: ProjectFile): NewBook | null {
  const title = project.title.trim();
  if (!title) {
    return null;
  }
  const bookFiles = filesForBook(project);
  const history = emptyHistory(bookFiles);
  return {
    title,
    fileName: bookFileName(title),
    project,
    history,
    files: withHistory(bookFiles, history),
  };
}

export function newBook(name: string): NewBook | null {
  const title = name.trim();
  if (!title) {
    return null;
  }
  const project = renameProject(createNovelProject(), title);
  const bookFiles = filesForBook(project);
  const history = emptyHistory(bookFiles);
  return {
    title,
    fileName: bookFileName(title),
    project,
    history,
    files: withHistory(bookFiles, history),
  };
}

export function filesToSave(project: ProjectFile, history: BookHistory): BookFiles {
  return withHistory(filesForBook(project), history);
}

export function importReplaceQuestion(path: string): string {
  return `Importing a book replaces everything in this file, including snapshots. All history will be wiped.\n\n${path}`;
}

export function recordedSnapshot(
  history: BookHistory,
  project: ProjectFile,
  kind: SnapshotKind,
  at: number,
  id: string,
): BookHistory | null {
  const next = takeSnapshot(history, filesForBook(project), kind, at, id);
  return next === history ? null : next;
}

export function restoredBook(history: BookHistory, id: string): BookRestore {
  const index = history.snapshots.findIndex((snapshot) => snapshot.id === id);
  if (index < 0) {
    return { kind: "absent" };
  }
  const project = bookAt(history, index);
  if (!project) {
    return { kind: "unreadable" };
  }
  return { kind: "ready", project };
}

export function restoredScene(history: BookHistory, project: ProjectFile, id: string): SceneRestore {
  const sceneId = project.view.selectedId;
  const index = history.snapshots.findIndex((snapshot) => snapshot.id === id);
  if (!sceneId || index < 0) {
    return { kind: "notice", message: "Select a scene to restore." };
  }
  const content = sceneAt(history, index, sceneId);
  if (!content) {
    return { kind: "notice", message: "That scene is not in this snapshot." };
  }
  return { kind: "ready", project: setDocumentContent(project, sceneId, content) };
}

export function withoutSnapshot(history: BookHistory, id: string): BookHistory {
  return deleteSnapshot(history, id);
}
