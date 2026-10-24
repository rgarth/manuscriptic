import { ask } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import {
  bookFromFiles,
  emptyHistory,
  filesForBook,
  historyFile,
  historyFromFiles,
  planSave,
  rememberSave,
  withHistory,
  type BookFiles,
  type BookHistory,
  type DiskHistory,
} from "./bookArchive";
import {
  bookFromArchive,
  filesToSave,
  importedBook,
  importReplaceQuestion,
  newBook,
  recordedSnapshot,
  restoredBook,
  restoredScene,
  withoutSnapshot,
} from "./bookSession";
import { failureMessage } from "./failures";
import { createBookLock, heldElsewhere } from "./bookLock";
import {
  bookFileName,
  markBookClosed,
  rememberOpenBook,
  titleFromBookPath,
  readFilePreferences,
} from "./filePrefs";
import { findNode, firstDocumentId, openFolders, setView, type ProjectFile } from "./model/project";
import { pickNovelSaveAs, pickNovelToOpen, pickScrivenerProject, resolveDirectory } from "./novelFile";
import { projectFromScrivener, scrivenerTitle } from "./scrivener/import";
import { bookIsOpen, fileExists, raiseBookWindow, readBook, readHistory, readScrivener, writeBook } from "./storage";
import { clearBookQuery, openBookWindow, tauriAvailable } from "./windows";

export type SaveState = "saved" | "dirty" | "saving" | "error";

type Notice = (error: unknown, fallback?: string) => void;

export function useBookFile(showNotice: Notice) {
  const [project, setProject] = useState<ProjectFile | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [history, setHistory] = useState<BookHistory | null>(null);

  const skipNextSave = useRef(true);
  const generation = useRef(0);
  const pendingSave = useRef<number | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const projectRef = useRef<ProjectFile | null>(null);
  const filePathRef = useRef<string | null>(null);
  const historyRef = useRef<BookHistory | null>(null);
  const storedFiles = useRef<BookFiles | null>(null);
  const disk = useRef<DiskHistory>({ phase: "absent" });
  const fileBusy = useRef(false);
  const noticeRef = useRef(showNotice);
  noticeRef.current = showNotice;
  const api = useRef({
    reload: async (_path: string) => {},
    drop: () => {},
    cancelSave: () => {},
    noteSaved: () => {},
    noteSaveError: (_message: string) => {},
  });
  const lock = useRef<ReturnType<typeof createBookLock> | null>(null);
  if (!lock.current) {
    lock.current = createBookLock({
      showNotice: (error, fallback) => noticeRef.current(error, fallback),
      currentPath: () => filePathRef.current,
      reload: (path) => api.current.reload(path),
      drop: () => api.current.drop(),
      cancelSave: () => api.current.cancelSave(),
      setSaved: () => api.current.noteSaved(),
      setSaveError: (message) => api.current.noteSaveError(message),
    });
  }
  const bookLock = lock.current;
  projectRef.current = project;
  filePathRef.current = filePath;
  historyRef.current = history;

  function filesForSave(current: ProjectFile, bookHistory: BookHistory): BookFiles {
    const pages = filesForBook(current);
    const onDisk = disk.current;
    if (onDisk.phase === "ready" && bookHistory === onDisk.history) {
      return { ...pages, [historyFile]: onDisk.text };
    }
    return withHistory(pages, bookHistory);
  }

  function rememberDisk(files: BookFiles, bookHistory: BookHistory) {
    storedFiles.current = files;
    const text = files[historyFile];
    disk.current = text !== undefined ? { phase: "ready", history: bookHistory, text } : { phase: "absent" };
  }

  function enqueueSave(saveGeneration: number): Promise<void> {
    const path = filePathRef.current;
    const current = projectRef.current;
    const bookHistory = historyRef.current;
    if (!path || !current || !bookHistory) {
      const message = "Could not save. The book is not ready.";
      setSaveState("error");
      setSaveError(message);
      noticeRef.current(message);
      return Promise.resolve();
    }
    if (bookLock.blockSave()) {
      noticeRef.current(heldElsewhere);
      return Promise.resolve();
    }
    const started = disk.current;
    const next = filesForSave(current, bookHistory);
    const patch = planSave(storedFiles.current, next, started);
    if (!patch.rewrite) {
      setSaveState("saved");
      setSaveError(null);
      return Promise.resolve();
    }
    setSaveState("saving");
    const pending = saveQueue.current.then(async () => {
      if (saveGeneration !== generation.current) {
        throw new Error("Save was superseded.");
      }
      if (!(await bookLock.stillOurs(path))) {
        throw new Error(heldElsewhere);
      }
      await writeBook(path, patch.files, patch.keep, true);
      const remembered = rememberSave(storedFiles.current, next, started, disk.current, bookHistory);
      storedFiles.current = remembered.files;
      disk.current = remembered.disk;
      if (saveGeneration !== generation.current) {
        throw new Error("Save was superseded.");
      }
    });
    saveQueue.current = pending.then(
      () => {
        if (saveGeneration === generation.current) {
          setSaveState("saved");
          setSaveError(null);
        }
      },
      (error: unknown) => {
        if (error instanceof Error && error.message === "Save was superseded.") {
          return;
        }
        setSaveState("error");
        setSaveError(failureMessage(error, "Could not save."));
        noticeRef.current(error, "Could not save.");
      },
    );
    return pending;
  }

  function flushSave(): Promise<void> {
    if (projectRef.current && pendingSave.current !== null) {
      window.clearTimeout(pendingSave.current);
      pendingSave.current = null;
      return enqueueSave(generation.current);
    }
    return saveQueue.current;
  }

  async function leaveBook() {
    const path = filePathRef.current;
    if (!path) {
      return;
    }
    try {
      await flushSave();
    } catch (error: unknown) {
      noticeRef.current(error, "Could not save.");
    }
    try {
      await bookLock.release(path);
    } catch (error: unknown) {
      noticeRef.current(error, "Could not release the book lock.");
    }
    try {
      markBookClosed(localStorage, path);
    } catch (error: unknown) {
      noticeRef.current(error, "Could not update the list of open books.");
    }
    clearBookQuery();
    dropBook();
  }

  function openProject(next: ProjectFile) {
    const selected =
      next.view.selectedId && findNode(next, next.view.selectedId)
        ? next.view.selectedId
        : firstDocumentId(next.manuscript);
    skipNextSave.current = true;
    setProject(
      setView(next, {
        selectedId: selected,
        expanded: openFolders(next),
      }),
    );
  }

  function showBook(next: ProjectFile, path: string, bookHistory: BookHistory) {
    if (pendingSave.current !== null) {
      window.clearTimeout(pendingSave.current);
      pendingSave.current = null;
    }
    historyRef.current = bookHistory;
    filePathRef.current = path;
    setHistory(bookHistory);
    setFilePath(path);
    openProject(next);
    setReady(true);
    try {
      rememberOpenBook(localStorage, path);
    } catch (error: unknown) {
      noticeRef.current(error, "Could not remember this open book.");
    }
  }

  function markReady() {
    setReady(true);
  }

  function noteSaved() {
    setSaveState("saved");
    setSaveError(null);
  }

  function noteSaveError(message: string) {
    setSaveState("error");
    setSaveError(message);
  }

  function cancelSave() {
    generation.current += 1;
    if (pendingSave.current !== null) {
      window.clearTimeout(pendingSave.current);
      pendingSave.current = null;
    }
  }

  function dropBook() {
    cancelSave();
    historyRef.current = null;
    filePathRef.current = null;
    storedFiles.current = null;
    disk.current = { phase: "absent" };
    setHistory(null);
    setFilePath(null);
    setProject(null);
    setReady(true);
    setSaveState("saved");
    setSaveError(null);
  }

  async function readWholeBook(path: string) {
    const files = await readBook(path);
    const text = await readHistory(path);
    const all = text == null ? files : { ...files, [historyFile]: text };
    return { ...bookFromArchive(all), files: all };
  }

  async function reloadSavedBook(path: string) {
    const opened = await readWholeBook(path);
    if (filePathRef.current !== path) {
      return;
    }
    rememberDisk(opened.files, opened.history);
    showBook(opened.project, path, opened.history);
  }

  async function attachHistory(path: string) {
    const text = await readHistory(path);
    if (filePathRef.current !== path) {
      return;
    }
    if (text == null) {
      disk.current = { phase: "absent" };
      return;
    }
    const loaded = historyFromFiles({ ...(storedFiles.current ?? {}), [historyFile]: text });
    if (!loaded) {
      throw new Error("That book could not be read.");
    }
    if (filePathRef.current !== path) {
      return;
    }
    storedFiles.current = { ...(storedFiles.current ?? {}), [historyFile]: text };
    disk.current = { phase: "ready", history: loaded, text };
    skipNextSave.current = true;
    historyRef.current = loaded;
    setHistory(loaded);
  }

  async function loadBook(path: string) {
    if (!(await bookLock.ensure(path))) {
      setReady(true);
      return;
    }
    const files = await readBook(path);
    const opened = bookFromFiles(files);
    if (!opened) {
      throw new Error("That book could not be read.");
    }
    const pending = emptyHistory(files);
    disk.current = { phase: "unread" };
    storedFiles.current = files;
    showBook(opened, path, pending);
    bookLock.held();
    try {
      await attachHistory(path);
    } catch (error: unknown) {
      noticeRef.current(error, "Could not read the book's history.");
    }
  }

  async function refuseOpenBook(path: string): Promise<boolean> {
    if (!tauriAvailable() || !(await bookIsOpen(path))) {
      return false;
    }
    noticeRef.current("That book is open. Choose a different file.");
    return true;
  }

  async function placeNewBook(path: string, created: { title: string; files: BookFiles; project: ProjectFile; history: BookHistory }) {
    if (await refuseOpenBook(path)) {
      return;
    }
    await writeBook(path, created.files, [], true);
    noticeRef.current(null);
    if (projectRef.current) {
      await openBookWindow(path, created.title);
      return;
    }
    if (!(await bookLock.ensure(path))) {
      return;
    }
    rememberDisk(created.files, created.history);
    showBook(created.project, path, created.history);
    bookLock.held();
  }

  async function createBook() {
    if (fileBusy.current) {
      return;
    }
    fileBusy.current = true;
    try {
      const directory = await resolveDirectory(readFilePreferences(localStorage).directory);
      const path = await pickNovelSaveAs(directory, bookFileName("Untitled Novel"), "New Book");
      if (!path) {
        return;
      }
      const created = newBook(titleFromBookPath(path));
      if (!created) {
        noticeRef.current("A book needs a name.");
        return;
      }
      await placeNewBook(path, created);
    } catch (error: unknown) {
      noticeRef.current(error, "Could not create a novel.");
    } finally {
      fileBusy.current = false;
    }
  }

  async function importScrivener() {
    if (fileBusy.current) {
      return;
    }
    fileBusy.current = true;
    try {
      const directory = await resolveDirectory(readFilePreferences(localStorage).directory);
      const picked = await pickScrivenerProject(directory);
      if (!picked) {
        return;
      }
      const imported = projectFromScrivener(scrivenerTitle(picked), await readScrivener(picked));
      if (!imported) {
        noticeRef.current("That Scrivener project has no binder.");
        return;
      }
      const created = importedBook(imported);
      if (!created) {
        noticeRef.current("A book needs a name.");
        return;
      }
      const path = await pickNovelSaveAs(directory, created.fileName, "Import Scrivener Project");
      if (!path) {
        return;
      }
      if (await refuseOpenBook(path)) {
        return;
      }
      if (await fileExists(path)) {
        if (!(await confirmImportReplace(path))) {
          return;
        }
      }
      await placeNewBook(path, created);
    } catch (error: unknown) {
      noticeRef.current(error, "Could not import that Scrivener project.");
    } finally {
      fileBusy.current = false;
    }
  }

  function recordSnapshot(kind: "manual" | "auto") {
    const current = projectRef.current;
    const bookHistory = historyRef.current;
    if (!current || !bookHistory || !filePathRef.current || disk.current.phase === "unread" || bookLock.lost()) {
      return;
    }
    const next = recordedSnapshot(bookHistory, current, kind, Date.now(), crypto.randomUUID());
    if (!next) {
      return;
    }
    historyRef.current = next;
    setHistory(next);
  }

  function restoreSnapshotBook(id: string) {
    const bookHistory = historyRef.current;
    if (!bookHistory) {
      return;
    }
    const restored = restoredBook(bookHistory, id);
    switch (restored.kind) {
      case "absent":
        return;
      case "unreadable":
        noticeRef.current("That snapshot could not be read.");
        return;
      case "ready":
        noticeRef.current(null);
        setProject(restored.project);
        return;
      default: {
        const unexpected: never = restored;
        return unexpected;
      }
    }
  }

  function restoreSnapshotScene(id: string) {
    const bookHistory = historyRef.current;
    const current = projectRef.current;
    if (!bookHistory || !current) {
      noticeRef.current("Select a scene to restore.");
      return;
    }
    const restored = restoredScene(bookHistory, current, id);
    switch (restored.kind) {
      case "notice":
        noticeRef.current(restored.message);
        return;
      case "ready":
        noticeRef.current(null);
        setProject(restored.project);
        return;
      default: {
        const unexpected: never = restored;
        return unexpected;
      }
    }
  }

  function removeSnapshot(id: string) {
    const bookHistory = historyRef.current;
    if (!bookHistory) {
      return;
    }
    const next = withoutSnapshot(bookHistory, id);
    historyRef.current = next;
    setHistory(next);
  }

  async function openNovelFile() {
    if (fileBusy.current) {
      return;
    }
    fileBusy.current = true;
    try {
      const directory = await resolveDirectory(readFilePreferences(localStorage).directory);
      const picked = await pickNovelToOpen(directory);
      if (!picked) {
        return;
      }
      if (projectRef.current) {
        await openBookWindow(picked, picked);
        return;
      }
      if (tauriAvailable() && (await raiseBookWindow(picked))) {
        return;
      }
      await loadBook(picked);
    } catch (error: unknown) {
      noticeRef.current(error, "Could not open that novel.");
    } finally {
      fileBusy.current = false;
    }
  }

  async function saveNovelFile() {
    const current = projectRef.current;
    if (!current || fileBusy.current) {
      return;
    }
    fileBusy.current = true;
    try {
      if (disk.current.phase === "unread" || !historyRef.current) {
        noticeRef.current("This book is still opening.");
        return;
      }
      const directory = await resolveDirectory(readFilePreferences(localStorage).directory);
      const path = await pickNovelSaveAs(directory, bookFileName(current.title));
      if (!path) {
        return;
      }
      const previous = filePathRef.current;
      if (previous !== path && !(await bookLock.ensure(path))) {
        return;
      }
      const files = filesToSave(current, historyRef.current);
      await writeBook(path, files, [], true);
      if (previous && previous !== path) {
        await bookLock.release(previous);
      }
      rememberDisk(files, historyRef.current);
      filePathRef.current = path;
      skipNextSave.current = true;
      setFilePath(path);
      bookLock.held();
      setSaveState("saved");
      setSaveError(null);
      rememberOpenBook(localStorage, path);
    } catch (error: unknown) {
      noticeRef.current(error, "Could not save.");
    } finally {
      fileBusy.current = false;
    }
  }

  useEffect(() => {
    if (!filePath) {
      return;
    }
    return bookLock.watch(filePath);
  }, [filePath]);

  useEffect(() => {
    if (!project || !filePath) {
      return;
    }
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const nextGeneration = ++generation.current;
    setSaveState("dirty");
    setSaveError(null);
    if (pendingSave.current !== null) {
      window.clearTimeout(pendingSave.current);
    }
    pendingSave.current = window.setTimeout(() => {
      pendingSave.current = null;
      void enqueueSave(nextGeneration);
    }, 1000);
  }, [project, history, filePath]);

  api.current = {
    reload: reloadSavedBook,
    drop: dropBook,
    cancelSave,
    noteSaved,
    noteSaveError,
  };

  return {
    project,
    setProject,
    filePath,
    ready,
    history,
    saveState,
    saveError,
    loadBook,
    createBook,
    importScrivener,
    openNovelFile,
    saveNovelFile,
    onWindowBlur() {
      bookLock.onBlur();
      flushSave();
    },
    onWindowFocus() {
      bookLock.onFocus();
    },
    hasBook: () => filePathRef.current !== null,
    leaveBook,
    markReady,
    recordSnapshot,
    restoreSnapshotBook,
    restoreSnapshotScene,
    removeSnapshot,
  };
}

function confirmImportReplace(path: string): Promise<boolean> {
  return ask(importReplaceQuestion(path), {
    title: "Import Scrivener",
    kind: "warning",
    okLabel: "Replace",
    cancelLabel: "Cancel",
  });
}
