import { useEffect, useRef, useState } from "react";
import Binder from "./Binder";
import SceneEditor from "./SceneEditor";
import {
  addFolder,
  addScene,
  createNovelProject,
  deleteForever,
  findNode,
  firstDocumentId,
  folderIds,
  isRoot,
  isStoredInTrash,
  manuscriptWordCount,
  moveToTrash,
  parseProject,
  renameNode,
  renameProject,
  setDocumentContent,
  wordCount,
  type EditorDoc,
  type ProjectFile,
} from "./model/project";
import { loadProject, saveProject } from "./storage";
import "./App.css";

type SaveState = "saved" | "dirty" | "saving" | "error";

export default function App() {
  const [project, setProject] = useState<ProjectFile | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [focusMode, setFocusMode] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [saveError, setSaveError] = useState<string | null>(null);

  const skipNextSave = useRef(true);
  const generation = useRef(0);
  const pendingSave = useRef<number | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const projectRef = useRef<ProjectFile | null>(null);
  projectRef.current = project;

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
        setFocusMode((value) => !value);
        return;
      }
      if (event.key === "Escape") {
        setFocusMode(false);
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

  function enqueueSave(saveGeneration: number, json: string) {
    setSaveState("saving");
    saveQueue.current = saveQueue.current.then(async () => {
      if (saveGeneration !== generation.current) {
        return;
      }
      try {
        await saveProject(json);
        if (saveGeneration === generation.current) {
          setSaveState("saved");
          setSaveError(null);
        }
      } catch (error: unknown) {
        if (saveGeneration === generation.current) {
          setSaveState("error");
          setSaveError(error instanceof Error ? error.message : "Could not save.");
        }
      }
    });
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

  function updateProject(next: ProjectFile) {
    setProject(next);
  }

  if (loadError && !project) {
    return (
      <main className="gate">
        <h1>Manuscriptic</h1>
        <p>{loadError}</p>
        <button type="button" onClick={() => openProject(createNovelProject())}>
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
  const trashDisabled = !selectedId || isRoot(project, selectedId);
  const trashLabel =
    selectedId && isStoredInTrash(project, selectedId) ? "Delete" : "Move to trash";

  return (
    <div className={focusMode ? "app focus" : "app"}>
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
          onRenameProject={(title) => updateProject(renameProject(project, title))}
          onAddScene={() => {
            const next = addScene(project, selectedId);
            updateProject(next);
            const created = newestChild(next, project);
            if (created) {
              setSelectedId(created);
              setExpanded((current) => new Set(current).add(parentOf(next, created) ?? ""));
            }
          }}
          onAddFolder={() => {
            const next = addFolder(project, selectedId);
            updateProject(next);
            const created = newestChild(next, project);
            if (created) {
              setSelectedId(created);
              setExpanded((current) => {
                const open = new Set(current);
                open.add(created);
                const parent = parentOf(next, created);
                if (parent) {
                  open.add(parent);
                }
                return open;
              });
            }
          }}
          onTrash={() => {
            if (!selectedId || isRoot(project, selectedId)) {
              return;
            }
            if (isStoredInTrash(project, selectedId)) {
              const parent = findNode(project, selectedId)?.parent;
              updateProject(deleteForever(project, selectedId));
              setSelectedId(parent?.id ?? project.trash.id);
              return;
            }
            updateProject(moveToTrash(project, selectedId));
          }}
          trashLabel={trashLabel}
          trashDisabled={trashDisabled}
        />
        <section className="editor-column">
          <div className="editor-toolbar">
            <button
              type="button"
              onClick={() => setFocusMode((value) => !value)}
              title="Hide the binder (Ctrl+Shift+F or Command+Shift+F)"
            >
              {focusMode ? "Show binder" : "Focus"}
            </button>
          </div>
          <div className="editor-scroll">
            {selected?.node.kind === "document" && selected.node.content ? (
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
              />
            ) : (
              <div className="page folder-note">
                <h1>{selected?.node.title ?? "Manuscript"}</h1>
                <p>Select a scene to write, or add one here.</p>
              </div>
            )}
          </div>
        </section>
      </div>
      <footer className="status">
        <span>
          {selected?.node.kind === "document"
            ? `${selected.node.title} · ${sceneWords.toLocaleString()} words`
            : "No scene selected"}
        </span>
        <span>Manuscript · {bookWords.toLocaleString()} words</span>
        <span title={saveError ?? undefined}>{saveLabel(saveState)}</span>
      </footer>
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

function newestChild(next: ProjectFile, previous: ProjectFile): string | null {
  const before = new Set(allIds(previous));
  return allIds(next).find((id) => !before.has(id)) ?? null;
}

function parentOf(project: ProjectFile, id: string): string | null {
  return findNode(project, id)?.parent?.id ?? null;
}

function allIds(project: ProjectFile): string[] {
  const ids: string[] = [];
  collectIds(project.manuscript, ids);
  collectIds(project.characters, ids);
  collectIds(project.places, ids);
  collectIds(project.frontMatter, ids);
  collectIds(project.research, ids);
  collectIds(project.trash, ids);
  return ids;
}

function collectIds(node: ProjectFile["manuscript"], ids: string[]): void {
  ids.push(node.id);
  for (const child of node.children) {
    collectIds(child, ids);
  }
}
