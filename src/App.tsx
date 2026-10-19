import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  bookFromArchive,
  filesToSave,
  newBook,
  recordedSnapshot,
  restoredBook,
  restoredScene,
  takenNameMessage,
  withoutSnapshot,
  type BookHistory,
} from "./bookSession";
import Binder from "./Binder";
import SceneEditor from "./SceneEditor";
import {
  addLeaf,
  addSection,
  deleteForever,
  emptyTrash,
  moveToTrash,
  placeNode,
  removal,
  restoreNode,
} from "./model/binder";
import {
  addDictionaryWord,
  findNode,
  firstDocumentId,
  folderIds,
  isRoot,
  leafAction,
  manuscriptWordCount,
  removeDictionaryWord,
  renameNode,
  renameProject,
  setDocumentContent,
  setPageLayout,
  setView,
  type ProjectFile,
} from "./model/project";
import { type EditorDoc, wordCount } from "./model/editorDoc";
import { installAppMenu } from "./appMenu";
import { commands, registerCommands } from "./commands";
import { failureMessage, onFailure, takePendingFailures } from "./failures";
import {
  applyBookStorage,
  bookFileName,
  booksOnStartup,
  titleFromBookPath,
  markBookClosed,
  readFilePreferences,
  readSnapshotMinutes,
  rememberOpenBook,
  type SnapshotMinutes,
} from "./filePrefs";
import { menuCommand, type MenuCommand } from "./menuCommand";
import { pickNovelSaveAs, pickNovelToOpen, resolveDirectory } from "./novelFile";
import Settings from "./Settings";
import { readBook, writeBook } from "./storage";
import { useBookLock } from "./useBookLock";
import { bookQuery, openBookWindow, tauriAvailable } from "./windows";
import "./App.css";

type SaveState = "saved" | "dirty" | "saving" | "error";

export default function App() {
  const [project, setProject] = useState<ProjectFile | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [binderOpen, setBinderOpen] = useState(true);
  const [notice, showNotice] = useNotice();
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [history, setHistory] = useState<BookHistory | null>(null);
  const [snapshotMinutes, setSnapshotMinutes] = useState<SnapshotMinutes>(() =>
    readSnapshotMinutes(localStorage),
  );
  const [pendingTrash, setPendingTrash] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const skipNextSave = useRef(true);
  const generation = useRef(0);
  const pendingSave = useRef<number | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const projectRef = useRef<ProjectFile | null>(null);
  const filePathRef = useRef<string | null>(null);
  const historyRef = useRef<BookHistory | null>(null);
  const fileBusy = useRef(false);
  const runMenu = useRef<(command: MenuCommand) => void>(() => undefined);
  const dialogs = useRef({
    pendingTrash: null as string | null,
    settingsOpen: false,
  });
  const selectedId = project?.view.selectedId ?? null;
  projectRef.current = project;
  filePathRef.current = filePath;
  historyRef.current = history;
  dialogs.current = { pendingTrash, settingsOpen };

  useEffect(() => {
    let cancelled = false;
    const startup = booksOnStartup(localStorage, bookQuery());
    const first = startup.paths[0];
    if (!first) {
      setReady(true);
      return;
    }
    loadBook(first)
      .then(async () => {
        if (cancelled || !startup.openRest) {
          return;
        }
        for (const path of startup.paths.slice(1)) {
          await openBookWindow(path, path);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          showNotice(error, "Could not open the project.");
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        event.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        setBinderOpen((value) => !value);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        runMenu.current({ name: "open" });
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        runMenu.current({ name: event.shiftKey ? "save-as" : "save" });
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        runMenu.current({ name: "settings" });
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        runMenu.current({ name: "new" });
        return;
      }
      if (event.key === "Escape") {
        if (dialogs.current.settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (dialogs.current.pendingTrash) {
          setPendingTrash(null);
          return;
        }
        setBinderOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
      enqueueSave(nextGeneration);
    }, 1000);
    return () => {
      if (pendingSave.current !== null) {
        window.clearTimeout(pendingSave.current);
        pendingSave.current = null;
      }
    };
  }, [project, history, filePath]);

  useEffect(() => {
    function onBlur() {
      bookLock.onBlur();
      flushSave();
    }
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  function openProject(next: ProjectFile) {
    const selected =
      next.view.selectedId && findNode(next, next.view.selectedId)
        ? next.view.selectedId
        : firstDocumentId(next.manuscript);
    skipNextSave.current = true;
    setProject(
      setView(next, {
        selectedId: selected,
        expanded: next.view.expanded ?? folderIds(next),
      }),
    );
  }

  function enqueueSave(saveGeneration: number): Promise<void> {
    const path = filePathRef.current;
    const current = projectRef.current;
    const bookHistory = historyRef.current;
    if (!path || !current || !bookHistory) {
      return Promise.resolve();
    }
    if (bookLock.blockSave()) {
      return Promise.resolve();
    }
    const files = filesToSave(current, bookHistory);
    setSaveState("saving");
    const pending = saveQueue.current.then(async () => {
      if (saveGeneration !== generation.current) {
        throw new Error("Save was superseded.");
      }
      if (!(await bookLock.stillOurs(path))) {
        throw new Error("This book is open somewhere else. This window did not save.");
      }
      await writeBook(path, files, true);
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
        if (saveGeneration === generation.current) {
          setSaveState("error");
          setSaveError(failureMessage(error, "Could not save."));
        }
      },
    );
    return pending;
  }

  function flushSave() {
    const current = projectRef.current;
    if (!current || pendingSave.current === null) {
      return;
    }
    window.clearTimeout(pendingSave.current);
    pendingSave.current = null;
    enqueueSave(generation.current);
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
      showNotice(error, "Could not remember this open book.");
    }
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
    setHistory(null);
    setFilePath(null);
    setProject(null);
    setReady(true);
    setSaveState("saved");
    setSaveError(null);
  }

  async function reloadSavedBook(path: string) {
    const opened = bookFromArchive(await readBook(path));
    if (filePathRef.current !== path) {
      return;
    }
    showBook(opened.project, path, opened.history);
  }

  const bookLock = useBookLock(filePath, {
    showNotice,
    currentPath: () => filePathRef.current,
    reload: reloadSavedBook,
    drop: dropBook,
    cancelSave,
    setSaved() {
      setSaveState("saved");
      setSaveError(null);
    },
    setSaveError(message) {
      setSaveState("error");
      setSaveError(message);
    },
  });

  async function loadBook(path: string) {
    if (!(await bookLock.ensure(path))) {
      setReady(true);
      return;
    }
    const opened = bookFromArchive(await readBook(path));
    showBook(opened.project, path, opened.history);
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
        showNotice("A book needs a name.");
        return;
      }
      await writeBook(path, created.files, false);
      showNotice(null);
      if (projectRef.current) {
        await openBookWindow(path, created.title);
        return;
      }
      if (!(await bookLock.ensure(path))) {
        return;
      }
      showBook(created.project, path, created.history);
      bookLock.held();
    } catch (error: unknown) {
      showNotice(takenNameMessage(error) ?? error, "Could not create a novel.");
    } finally {
      fileBusy.current = false;
    }
  }

  function recordSnapshot(kind: "manual" | "auto") {
    const current = projectRef.current;
    const bookHistory = historyRef.current;
    if (!current || !bookHistory || !filePathRef.current || bookLock.lost()) {
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
        showNotice("That snapshot could not be read.");
        return;
      case "ready":
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
      showNotice("Select a scene to restore.");
      return;
    }
    const restored = restoredScene(bookHistory, current, id);
    switch (restored.kind) {
      case "notice":
        showNotice(restored.message);
        return;
      case "ready":
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

  function runMenuCommand(command: MenuCommand) {
    switch (command.name) {
      case "new":
        void createBook();
        return;
      case "open":
        void openNovelFile();
        return;
      case "save":
        void saveNovelFile(false);
        return;
      case "save-as":
        void saveNovelFile(true);
        return;
      case "snapshot":
        recordSnapshot("manual");
        return;
      case "settings":
        setSettingsOpen(true);
        return;
      case "new-scene":
        insertScene();
        return;
      case "new-section":
        insertSection();
        return;
      case "trash":
        askTrash(projectRef.current?.view.selectedId ?? null);
        return;
      case "format":
        commands().format?.(command.command);
        return;
      case "align":
        setProject((current) =>
          current ? setPageLayout(current, { ...current.layout, align: command.align }) : current,
        );
        return;
      default: {
        const unexpected: never = command;
        return unexpected;
      }
    }
  }
  runMenu.current = runMenuCommand;

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
      await loadBook(picked);
    } catch (error: unknown) {
      showNotice(error, "Could not open that novel.");
    } finally {
      fileBusy.current = false;
    }
  }

  async function saveNovelFile(forceDialog: boolean) {
    const current = projectRef.current;
    if (!current || fileBusy.current) {
      return;
    }
    fileBusy.current = true;
    try {
      if (!forceDialog) {
        enqueueSave(++generation.current);
        return;
      }
      const directory = await resolveDirectory(readFilePreferences(localStorage).directory);
      const path = await pickNovelSaveAs(directory, bookFileName(current.title));
      if (!path || !historyRef.current) {
        return;
      }
      const previous = filePathRef.current;
      if (previous !== path && !(await bookLock.ensure(path))) {
        return;
      }
      await writeBook(path, filesToSave(current, historyRef.current), true);
      if (previous && previous !== path) {
        await bookLock.release(previous);
      }
      filePathRef.current = path;
      setFilePath(path);
      bookLock.held();
      setSaveState("saved");
      setSaveError(null);
      rememberOpenBook(localStorage, path);
    } catch (error: unknown) {
      showNotice(error, "Could not save.");
    } finally {
      fileBusy.current = false;
    }
  }

  useEffect(() => {
    return registerCommands({
      openSettings: () => runMenu.current({ name: "settings" }),
      newProject: () => runMenu.current({ name: "new" }),
      takeSnapshot: project ? () => runMenu.current({ name: "snapshot" }) : null,
      openNovel: () => runMenu.current({ name: "open" }),
      saveNovel: project ? () => runMenu.current({ name: "save" }) : null,
      saveNovelAs: project ? () => runMenu.current({ name: "save-as" }) : null,
      newScene: project ? () => runMenu.current({ name: "new-scene" }) : null,
      newSection: project ? () => runMenu.current({ name: "new-section" }) : null,
      trash: project ? () => runMenu.current({ name: "trash" }) : null,
      removal: project && selectedId ? removal(project, selectedId) : null,
      align: project?.layout.align ?? "justify",
      leafLabel: project ? leafAction(project, selectedId).menuLabel : "New Scene",
    });
  }, [project, selectedId]);

  useEffect(() => {
    void installAppMenu().catch((error: unknown) => {
      showNotice(error, "Could not install the menu.");
    });
  }, []);

  useEffect(() => {
    if (!tauriAvailable()) {
      return;
    }
    function onFocus() {
      void installAppMenu().catch((error: unknown) => {
        showNotice(error, "Could not install the menu.");
      });
      bookLock.onFocus();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [showNotice]);

  useEffect(() => {
    if (!tauriAvailable()) {
      return;
    }
    let unlisten: (() => void) | undefined;
    void listen("manuscriptic-command", (event) => {
      const command = menuCommand(event.payload);
      if (!command || !document.hasFocus()) {
        return;
      }
      runMenu.current(command);
    }).then((stop) => {
      unlisten = stop;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!snapshotMinutes || !project) {
      return;
    }
    const timer = window.setInterval(() => {
      recordSnapshot("auto");
    }, snapshotMinutes * 60 * 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [snapshotMinutes, project]);

  useEffect(() => {
    if (!filePath) {
      return;
    }
    const path = filePath;
    function onHide() {
      try {
        markBookClosed(localStorage, path);
      } catch (error: unknown) {
        showNotice(error, "Could not update the list of open books.");
      }
    }
    function onStorage(event: StorageEvent) {
      applyBookStorage(localStorage, event.key, event.newValue);
    }
    window.addEventListener("pagehide", onHide);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("storage", onStorage);
    };
  }, [filePath]);

  function settingsPanel(
    words: string[],
    onAddWord: (word: string) => void,
    onRemoveWord: (word: string) => void,
  ) {
    if (!settingsOpen) {
      return null;
    }
    return (
      <Settings
        words={words}
        onAddWord={onAddWord}
        onRemoveWord={onRemoveWord}
        onClose={() => setSettingsOpen(false)}
        snapshotMinutes={snapshotMinutes}
        snapshots={history?.snapshots ?? []}
        onSnapshotMinutes={setSnapshotMinutes}
        onTakeSnapshot={() => recordSnapshot("manual")}
        onRestoreBook={restoreSnapshotBook}
        onRestoreScene={restoreSnapshotScene}
        onDeleteSnapshot={removeSnapshot}
      />
    );
  }

  function insertScene(targetId?: string) {
    if (!project) {
      return;
    }
    const inserted = addLeaf(project, targetId ?? selectedId);
    selectInserted(inserted.project, inserted.id);
  }

  function insertSection(targetId?: string) {
    if (!project) {
      return;
    }
    const inserted = addSection(project, targetId ?? selectedId);
    selectInserted(inserted.project, inserted.id);
  }

  function askTrash(id: string | null) {
    if (!project || !id || !removal(project, id)) {
      return;
    }
    setPendingTrash(id);
  }

  function selectInserted(next: ProjectFile, id: string) {
    const located = findNode(next, id);
    const open = new Set(next.view.expanded ?? folderIds(next));
    if (located?.parent) {
      open.add(located.parent.id);
    }
    if (located?.node.kind === "folder") {
      open.add(located.node.id);
    }
    setProject(setView(next, { selectedId: id, expanded: [...open] }));
  }

  function selectNode(id: string) {
    setProject((current) => (current ? setView(current, { selectedId: id }) : current));
  }

  function toggleSection(id: string) {
    setProject((current) => {
      if (!current) {
        return current;
      }
      const open = new Set(current.view.expanded ?? folderIds(current));
      if (open.has(id)) {
        open.delete(id);
      } else {
        open.add(id);
      }
      return setView(current, { expanded: [...open] });
    });
  }

  if (!project) {
    return (
      <main className="gate">
        <h1>Manuscriptic</h1>
        {notice ? <p role="alert">{notice}</p> : null}
        {ready ? (
          <div className="gate-actions">
            <button
              type="button"
              onClick={() => {
                void openNovelFile();
              }}
            >
              Open
            </button>
            <button
              type="button"
              onClick={() => {
                void createBook();
              }}
            >
              Create New
            </button>
          </div>
        ) : (
          <p>Opening project…</p>
        )}
        {settingsPanel([], () => undefined, () => undefined)}
      </main>
    );
  }

  const selected = selectedId ? findNode(project, selectedId) : null;
  const sceneWords =
    selected?.node.kind === "document" ? wordCount(selected.node.content) : 0;
  const bookWords = manuscriptWordCount(project);
  const pendingRemoval = pendingTrash ? removal(project, pendingTrash) : null;
  const leaf = leafAction(project, selectedId);
  const addWord = (word: string) => {
    setProject((current) => (current ? addDictionaryWord(current, word) : current));
  };
  const removeWord = (word: string) => {
    setProject((current) => (current ? removeDictionaryWord(current, word) : current));
  };

  return (
    <div className="app">
      <div className="workspace">
        <Binder
          project={project}
          selectedId={selectedId}
          expanded={new Set(project.view.expanded ?? folderIds(project))}
          onToggle={toggleSection}
          onSelect={selectNode}
          onRenameProject={(title) => setProject(renameProject(project, title))}
          onAddScene={insertScene}
          onAddSection={insertSection}
          onAskTrash={askTrash}
          onRestore={(id) => setProject((current) => (current ? restoreNode(current, id) : current))}
          onPlace={(id, targetId, place) => {
            setProject((current) => {
              if (!current) {
                return current;
              }
              const next = placeNode(current, id, targetId, place);
              if (place !== "inside") {
                return next;
              }
              const open = new Set(next.view.expanded ?? folderIds(next));
              open.add(targetId);
              return setView(next, { expanded: [...open] });
            });
          }}
          open={binderOpen}
          onToggleOpen={() => setBinderOpen((value) => !value)}
        />
        <section className="editor-column">
          <div className="editor-scroll">
            {selected?.node.kind === "document" ? (
              <SceneEditor
                key={selected.node.id}
                title={selected.node.title}
                content={selected.node.content}
                onTitle={(title) => {
                  const id = selected.node.id;
                  setProject((current) => (current ? renameNode(current, id, title) : current));
                }}
                onContent={(content: EditorDoc) => {
                  const id = selected.node.id;
                  setProject((current) =>
                    current ? setDocumentContent(current, id, content) : current,
                  );
                }}
                layout={project.layout}
                onLayout={(layout) => {
                  setProject((current) => (current ? setPageLayout(current, layout) : current));
                }}
                dictionary={project.dictionary}
                onAddWord={addWord}
                onRemoveWord={removeWord}
              />
            ) : (
              <div className="page section-note">
                {selected && !isRoot(project, selected.node.id) ? (
                  <input
                    className="scene-title"
                    aria-label="Section title"
                    value={selected.node.title}
                    onChange={(event) => {
                      const id = selected.node.id;
                      const title = event.currentTarget.value;
                      setProject((current) => (current ? renameNode(current, id, title) : current));
                    }}
                  />
                ) : (
                  <h1>{selected?.node.title ?? "Manuscript"}</h1>
                )}
                <p>{leaf.empty}</p>
              </div>
            )}
          </div>
        </section>
      </div>
      <footer className="status">
        <span>
          {selected?.node.kind === "document"
            ? `${selected.node.title} · ${sceneWords.toLocaleString()} words`
            : leaf.idle}
        </span>
        <span>Manuscript · {bookWords.toLocaleString()} words</span>
        {notice ? <span role="alert">{notice}</span> : null}
        <span>{saveError ?? saveLabel(saveState)}</span>
      </footer>
      {settingsPanel(project.dictionary, addWord, removeWord)}
      {pendingTrash && pendingRemoval ? (
        <ConfirmDialog
          message={pendingRemoval.message}
          confirmLabel={pendingRemoval.label}
          onCancel={() => setPendingTrash(null)}
          onConfirm={() => {
            const id = pendingTrash;
            const action = pendingRemoval.action;
            setPendingTrash(null);
            switch (action) {
              case "delete": {
                const parent = findNode(project, id)?.parent;
                setProject(
                  setView(deleteForever(project, id), {
                    selectedId: parent?.id ?? project.trash.id,
                  }),
                );
                return;
              }
              case "empty": {
                const next = emptyTrash(project);
                const selected = selectedId && findNode(next, selectedId) ? selectedId : next.trash.id;
                setProject(setView(next, { selectedId: selected }));
                return;
              }
              case "move":
                setProject(moveToTrash(project, id));
                return;
              default: {
                const unexpected: never = action;
                return unexpected;
              }
            }
          }}
        />
      ) : null}
    </div>
  );
}

function ConfirmDialog({
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true">
        <p>{message}</p>
        <div>
          <button type="button" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function useNotice(): [string | null, (error: unknown, fallback?: string) => void] {
  const [notice, setNotice] = useState<string | null>(null);
  const showNotice = useCallback((error: unknown, fallback = "Something went wrong.") => {
    if (error == null) {
      setNotice(null);
      return;
    }
    setNotice(failureMessage(error, fallback));
  }, []);
  useEffect(() => {
    for (const message of takePendingFailures()) {
      showNotice(message, message);
    }
    return onFailure((message) => {
      showNotice(message, message);
    });
  }, [showNotice]);
  return [notice, showNotice];
}

function saveLabel(state: SaveState): string {
  switch (state) {
    case "saved":
      return "Saved";
    case "dirty":
      return "Unsaved changes";
    case "saving":
      return "Saving";
    case "error":
      return "Could not save";
    default: {
      const unexpected: never = state;
      return unexpected;
    }
  }
}

