import { useCallback, useEffect, useRef, useState } from "react";
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
  createNovelProject,
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
  setView,
  type ProjectFile,
} from "./model/project";
import { type EditorDoc, wordCount } from "./model/editorDoc";
import { installAppMenu } from "./appMenu";
import { commands, registerCommands } from "./commands";
import { failureMessage, onFailure, takePendingFailures } from "./failures";
import { readFilePreferences, saveAsChoice, saveChoice, writeLastProject } from "./filePrefs";
import { pickNovelSaveAs, pickNovelToOpen, resolveDirectory } from "./novelFile";
import { novelFromText, openAtStartup, placeNovel } from "./novelSession";
import Settings from "./Settings";
import { loadProject, readNovelFile, saveProject, writeNovelFile } from "./storage";
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
  const [confirmingNew, setConfirmingNew] = useState(false);
  const [pendingTrash, setPendingTrash] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const skipNextSave = useRef(true);
  const generation = useRef(0);
  const pendingSave = useRef<number | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const projectRef = useRef<ProjectFile | null>(null);
  const filePathRef = useRef<string | null>(null);
  const fileBusy = useRef(false);
  const dialogs = useRef({
    confirmingNew: false,
    pendingTrash: null as string | null,
    settingsOpen: false,
  });
  const selectedId = project?.view.selectedId ?? null;
  projectRef.current = project;
  filePathRef.current = filePath;
  dialogs.current = { confirmingNew, pendingTrash, settingsOpen };

  useEffect(() => {
    let cancelled = false;
    const prefs = readFilePreferences(localStorage);
    loadProject()
      .then((raw) => openAtStartup(prefs, raw, readNovelFile))
      .then((started) => {
        if (cancelled) {
          return;
        }
        if (started.notice) {
          showNotice(started.notice);
        }
        if (started.project) {
          setFilePath(started.path);
          openProject(started.project);
        }
        setReady(true);
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
        commands().openNovel?.();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (event.shiftKey) {
          commands().saveNovelAs?.();
        } else {
          commands().saveNovel?.();
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        setSettingsOpen(true);
        return;
      }
      if (event.key === "Escape") {
        if (dialogs.current.settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (dialogs.current.confirmingNew) {
          setConfirmingNew(false);
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
    if (!project) {
      return;
    }
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    const nextGeneration = ++generation.current;
    const json = JSON.stringify(project);
    setSaveState("dirty");
    setSaveError(null);
    if (pendingSave.current !== null) {
      window.clearTimeout(pendingSave.current);
    }
    pendingSave.current = window.setTimeout(() => {
      pendingSave.current = null;
      enqueueSave(nextGeneration, json);
    }, 1000);
    return () => {
      if (pendingSave.current !== null) {
        window.clearTimeout(pendingSave.current);
        pendingSave.current = null;
      }
    };
  }, [project]);

  useEffect(() => {
    function onBlur() {
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

  function enqueueSave(saveGeneration: number, json: string, previous?: string): Promise<void> {
    setSaveState("saving");
    const pending = saveQueue.current.then(async () => {
      if (saveGeneration !== generation.current) {
        throw new Error("Save was superseded.");
      }
      await saveProject(json, previous);
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
    enqueueSave(generation.current, JSON.stringify(current));
  }

  async function adoptNovel(next: ProjectFile, path: string | null) {
    const current = projectRef.current;
    if (pendingSave.current !== null) {
      window.clearTimeout(pendingSave.current);
      pendingSave.current = null;
    }
    const nextGeneration = ++generation.current;
    await enqueueSave(
      nextGeneration,
      JSON.stringify(next),
      current ? JSON.stringify(current) : undefined,
    );
    setFilePath(path);
    openProject(next);
    setReady(true);
    try {
      writeLastProject(localStorage, path);
    } catch (error: unknown) {
      showNotice(error, "Could not save this preference.");
    }
  }

  async function beginNewProject() {
    await adoptNovel(createNovelProject(), null);
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
      await adoptNovel(novelFromText(await readNovelFile(picked)), picked);
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
      const prefs = readFilePreferences(localStorage);
      const step = forceDialog
        ? saveAsChoice(prefs, current.title)
        : saveChoice(prefs, filePathRef.current, current.title);
      const path = await placeNovel(step, JSON.stringify(current), {
        directory: resolveDirectory,
        pickSave: pickNovelSaveAs,
        write: writeNovelFile,
      });
      if (!path) {
        return;
      }
      setFilePath(path);
      setSaveState("saved");
      setSaveError(null);
      writeLastProject(localStorage, path);
    } catch (error: unknown) {
      showNotice(error, "Could not save.");
    } finally {
      fileBusy.current = false;
    }
  }

  useEffect(() => {
    return registerCommands({
      openSettings: () => setSettingsOpen(true),
    });
  }, []);

  useEffect(() => {
    return registerCommands({
      newProject: () => {
        if (!projectRef.current) {
          void beginNewProject().catch((error: unknown) => {
            showNotice(error, "Could not create a novel.");
          });
          return;
        }
        setBinderOpen(true);
        setConfirmingNew(true);
      },
      openNovel: () => {
        void openNovelFile();
      },
      saveNovel: project
        ? () => {
            void saveNovelFile(false);
          }
        : null,
      saveNovelAs: project
        ? () => {
            void saveNovelFile(true);
          }
        : null,
      newScene: project ? () => insertScene() : null,
      newSection: project ? () => insertSection() : null,
      trash: project ? () => askTrash(selectedId) : null,
      removal: project && selectedId ? removal(project, selectedId) : null,
      leafLabel: project ? leafAction(project, selectedId).menuLabel : "New Scene",
    });
  }, [project, selectedId]);

  useEffect(() => {
    void installAppMenu().catch((error: unknown) => {
      showNotice(error, "Could not install the menu.");
    });
  }, []);

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
                void beginNewProject().catch((error: unknown) => {
                  showNotice(error, "Could not create a novel.");
                });
              }}
            >
              Create New
            </button>
          </div>
        ) : (
          <p>Opening project…</p>
        )}
        {settingsOpen ? (
          <Settings
            words={[]}
            onAddWord={() => undefined}
            onRemoveWord={() => undefined}
            onClose={() => setSettingsOpen(false)}
          />
        ) : null}
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
      {settingsOpen ? (
        <Settings
          words={project.dictionary}
          onAddWord={addWord}
          onRemoveWord={removeWord}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {confirmingNew ? (
        <ConfirmDialog
          message="Replace this novel with a blank one? The current book is copied to backups first."
          confirmLabel="Replace"
          onCancel={() => setConfirmingNew(false)}
          onConfirm={() => {
            void beginNewProject().then(
              () => setConfirmingNew(false),
              (error: unknown) => {
                showNotice(error, "Could not create a novel.");
                setConfirmingNew(false);
              },
            );
          }}
        />
      ) : null}
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

