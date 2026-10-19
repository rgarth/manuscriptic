import { useEffect, useRef, useState } from "react";
import Binder from "./Binder";
import SceneEditor from "./SceneEditor";
import {
  addDictionaryWord,
  addLeaf,
  leafAction,
  removeDictionaryWord,
  addSection,
  createNovelProject,
  deleteForever,
  findNode,
  firstDocumentId,
  folderIds,
  manuscriptWordCount,
  moveToTrash,
  parseProject,
  removal,
  renameNode,
  renameProject,
  setDocumentContent,
  type ProjectFile,
} from "./model/project";
import { type EditorDoc, wordCount } from "./model/editorDoc";
import { installAppMenu } from "./appMenu";
import { registerCommands } from "./commands";
import Settings from "./Settings";
import { loadProject, saveProject } from "./storage";
import "./App.css";

type SaveState = "saved" | "dirty" | "saving" | "error";

export default function App() {
  const [project, setProject] = useState<ProjectFile | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [binderOpen, setBinderOpen] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
  const dialogs = useRef({
    confirmingNew: false,
    pendingTrash: null as string | null,
    settingsOpen: false,
  });
  projectRef.current = project;
  dialogs.current = { confirmingNew, pendingTrash, settingsOpen };

  useEffect(() => {
    let cancelled = false;
    loadProject()
      .then((raw) => {
        if (cancelled) {
          return;
        }
        if (raw === null) {
          openProject(createNovelProject());
          return;
        }
        const parsed = parseProject(raw);
        if (!parsed) {
          setLoadError("The saved project could not be read.");
          return;
        }
        openProject(parsed);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not open the project.");
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
    skipNextSave.current = true;
    setProject(next);
    setExpanded(new Set(folderIds(next)));
    setSelectedId(firstDocumentId(next.manuscript));
    setLoadError(null);
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
          setSaveError(error instanceof Error ? error.message : "Could not save.");
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

  async function beginNewProject() {
    const current = projectRef.current;
    if (pendingSave.current !== null) {
      window.clearTimeout(pendingSave.current);
      pendingSave.current = null;
    }
    const nextGeneration = ++generation.current;
    const next = createNovelProject();
    await enqueueSave(
      nextGeneration,
      JSON.stringify(next),
      current ? JSON.stringify(current) : undefined,
    );
    openProject(next);
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
          void beginNewProject().catch(() => undefined);
          return;
        }
        setBinderOpen(true);
        setConfirmingNew(true);
      },
      newScene: project ? () => insertScene() : null,
      newSection: project ? () => insertSection() : null,
      trash: project ? () => askTrash(selectedId) : null,
      removal: project && selectedId ? removal(project, selectedId) : null,
      leafLabel: project ? leafAction(project, selectedId).menuLabel : "New Scene",
    });
  }, [project, selectedId]);

  useEffect(() => {
    void installAppMenu().catch(() => undefined);
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
    setProject(next);
    setSelectedId(id);
    const located = findNode(next, id);
    setExpanded((current) => {
      const open = new Set(current);
      if (located?.parent) {
        open.add(located.parent.id);
      }
      if (located?.node.kind === "folder") {
        open.add(located.node.id);
      }
      return open;
    });
  }

  if (loadError && !project) {
    return (
      <main className="gate">
        <h1>Manuscriptic</h1>
        <p>{loadError}</p>
        <button
          type="button"
          onClick={() => {
            void beginNewProject().catch(() => undefined);
          }}
        >
          Start a new project
        </button>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="gate">
        <p>Opening project…</p>
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
          expanded={expanded}
          onToggle={(id) => {
            setExpanded((current) => {
              const next = new Set(current);
              if (next.has(id)) {
                next.delete(id);
              } else {
                next.add(id);
              }
              return next;
            });
          }}
          onSelect={setSelectedId}
          onRenameProject={(title) => setProject(renameProject(project, title))}
          onAddScene={insertScene}
          onAddSection={insertSection}
          onAskTrash={askTrash}
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
                <h1>{selected?.node.title ?? "Manuscript"}</h1>
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
        <span title={saveError ?? undefined}>{saveLabel(saveState)}</span>
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
              () => undefined,
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
                setProject(deleteForever(project, id));
                setSelectedId(parent?.id ?? project.trash.id);
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

