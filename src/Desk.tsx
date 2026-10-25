import { lazy, Suspense, type ReactNode } from "react";
import Binder from "./Binder";
import CompileSettings from "./CompileSettings";
import ExportDialog from "./ExportDialog";
import {
  applyTrash,
  insertScene,
  insertSection,
  placeOpened,
  toggleSection,
} from "./binderActions";

// The editor stays out of the startup script so a new window can paint first.
const loadSceneEditor = () => import("./SceneEditor");
const SceneEditor = lazy(loadSceneEditor);

export function preloadSceneEditor(): void {
  void loadSceneEditor();
}
import Settings from "./Settings";
import Snapshots from "./Snapshots";
import WritingClock from "./WritingClock";
import type { BookHistory } from "./bookSession";
import type { SnapshotMinutes } from "./filePrefs";
import { removal, restoreNode } from "./model/binder";
import { wordCount, type EditorDoc } from "./model/editorDoc";
import {
  addDictionaryWord,
  findNode,
  isRoot,
  leafAction,
  manuscriptWordCount,
  openFolders,
  removeDictionaryWord,
  renameNode,
  renameProject,
  setDocumentContent,
  setPageLayout,
  setView,
  type ProjectFile,
} from "./model/project";
import { publishingHint } from "./publishingPages";
import type { SaveState } from "./useBookFile";

export type DeskDialog = "settings" | "snapshots" | "compile" | "book-settings";

type DeskProps = {
  project: ProjectFile;
  history: BookHistory | null;
  binderOpen: boolean;
  onBinderOpen: (open: boolean) => void;
  pendingTrash: string | null;
  onAskTrash: (id: string) => void;
  onPendingTrash: (id: string | null) => void;
  filePath: string | null;
  dialog: DeskDialog | null;
  onDialog: (dialog: DeskDialog | null) => void;
  notice: string | null;
  saveState: SaveState;
  saveError: string | null;
  snapshotMinutes: SnapshotMinutes;
  onSnapshotMinutes: (minutes: SnapshotMinutes) => void;
  onProject: (update: (project: ProjectFile) => ProjectFile) => void;
  onTakeSnapshot: () => void;
  onRestoreBook: (id: string) => void;
  onRestoreScene: (id: string) => void;
  onDeleteSnapshot: (id: string) => void;
};

export default function Desk({
  project,
  history,
  binderOpen,
  onBinderOpen,
  pendingTrash,
  onAskTrash,
  onPendingTrash,
  filePath,
  dialog,
  onDialog,
  notice,
  saveState,
  saveError,
  snapshotMinutes,
  onSnapshotMinutes,
  onProject,
  onTakeSnapshot,
  onRestoreBook,
  onRestoreScene,
  onDeleteSnapshot,
}: DeskProps) {
  const selectedId = project.view.selectedId;
  const selected = selectedId ? findNode(project, selectedId) : null;
  const sceneWords = selected?.node.kind === "document" ? wordCount(selected.node.content) : 0;
  const bookWords = manuscriptWordCount(project);
  const pendingRemoval = pendingTrash ? removal(project, pendingTrash) : null;
  const leaf = leafAction(project, selectedId);
  const addWord = (word: string) => {
    onProject((current) => addDictionaryWord(current, word));
  };
  const removeWord = (word: string) => {
    onProject((current) => removeDictionaryWord(current, word));
  };

  return (
    <div className="app">
      <div className="workspace">
        <Binder
          project={project}
          selectedId={selectedId}
          expanded={new Set(project.view.expanded ?? openFolders(project))}
          onToggle={(id) => onProject((current) => toggleSection(current, id))}
          onSelect={(id) => onProject((current) => setView(current, { selectedId: id }))}
          onRenameProject={(title) => onProject((current) => renameProject(current, title))}
          onAddScene={(id) => onProject((current) => insertScene(current, id ?? current.view.selectedId))}
          onAddSection={(id) => onProject((current) => insertSection(current, id ?? current.view.selectedId))}
          onAskTrash={onAskTrash}
          onRestore={(id) => onProject((current) => restoreNode(current, id))}
          onPlace={(id, targetId, place) => onProject((current) => placeOpened(current, id, targetId, place))}
          open={binderOpen}
          onToggleOpen={() => onBinderOpen(!binderOpen)}
        />
        <section className="editor-column">
          {selected?.node.kind === "document" ? (
            <Suspense fallback={<Opening />}>
              <SceneEditor
                key={selected.node.id}
                title={selected.node.title}
                content={selected.node.content}
                onTitle={(title) => {
                  const id = selected.node.id;
                  onProject((current) => renameNode(current, id, title));
                }}
                onContent={(content: EditorDoc) => {
                  const id = selected.node.id;
                  onProject((current) => setDocumentContent(current, id, content));
                }}
                hint={publishingHint(selected.node.role, selected.node.title, selected.node.content)}
                layout={project.layout}
                onLayout={(layout) => onProject((current) => setPageLayout(current, layout))}
                dictionary={project.dictionary}
                manuscript={selected.root === "manuscript"}
                onAddWord={addWord}
                onRemoveWord={removeWord}
              />
            </Suspense>
          ) : (
            <div className="editor-scroll">
              <div className="page section-note">
                {selected && !isRoot(project, selected.node.id) ? (
                  <input
                    className="scene-title"
                    aria-label="Section title"
                    value={selected.node.title}
                    onChange={(event) => {
                      const id = selected.node.id;
                      const title = event.currentTarget.value;
                      onProject((current) => renameNode(current, id, title));
                    }}
                  />
                ) : (
                  <h1>{selected?.node.title ?? "Manuscript"}</h1>
                )}
                <p>{leaf.empty}</p>
              </div>
            </div>
          )}
        </section>
      </div>
      {dialog === "snapshots" ? (
        <Snapshots
          snapshotMinutes={snapshotMinutes}
          snapshots={history?.snapshots ?? []}
          history={history}
          openDocument={
            selected?.node.kind === "document" ? { id: selected.node.id, title: selected.node.title } : null
          }
          onSnapshotMinutes={onSnapshotMinutes}
          onTakeSnapshot={onTakeSnapshot}
          onRestoreBook={onRestoreBook}
          onRestoreScene={onRestoreScene}
          onDeleteSnapshot={onDeleteSnapshot}
          onClose={() => onDialog(null)}
        />
      ) : null}
      <footer className="status">
        <span>
          {selected?.node.kind === "document"
            ? `${selected.node.title} · ${sceneWords.toLocaleString()} words`
            : leaf.idle}
        </span>
        <span>Manuscript · {bookWords.toLocaleString()} words</span>
        {notice ? <span role="alert">{notice}</span> : null}
        <span className="status-actions">
          <WritingClock
            bookKey={filePath}
            sceneId={selected?.node.kind === "document" ? selected.node.id : null}
            content={selected?.node.kind === "document" ? selected.node.content : null}
            manuscriptWords={bookWords}
          />
          <button
            type="button"
            className="status-button"
            aria-expanded={dialog === "snapshots"}
            onClick={() => onDialog(dialog === "snapshots" ? null : "snapshots")}
          >
            Snapshots
          </button>
          <span>{saveError ?? saveLabel(saveState)}</span>
        </span>
      </footer>
      {dialog === "compile" ? (
        <ExportDialog project={project} onClose={() => onDialog(null)} />
      ) : null}
      {dialog === "book-settings" ? (
        <CompileSettings project={project} onProject={onProject} onClose={() => onDialog(null)} />
      ) : null}
      {dialog === "settings" ? <Settings onClose={() => onDialog(null)} /> : null}
      {pendingTrash && pendingRemoval ? (
        <ConfirmDialog
          message={pendingRemoval.message}
          confirmLabel={pendingRemoval.label}
          onCancel={() => onPendingTrash(null)}
          onConfirm={() => {
            const id = pendingTrash;
            const action = pendingRemoval.action;
            onPendingTrash(null);
            onProject((current) => applyTrash(current, id, action, current.view.selectedId));
          }}
        />
      ) : null}
    </div>
  );
}

export function Opening() {
  return (
    <div className="opening" role="status" aria-live="polite">
      <div className="opening-track" aria-hidden="true">
        <span />
      </div>
      <p>Opening…</p>
    </div>
  );
}

export function Gate({
  notice,
  ready,
  settings,
  onOpen,
  onCreate,
  onImport,
}: {
  notice: string | null;
  ready: boolean;
  settings: ReactNode;
  onOpen: () => void;
  onCreate: () => void;
  onImport: () => void;
}) {
  if (!ready) {
    return <Opening />;
  }
  return (
    <main className="gate">
      <h1>Manuscriptic</h1>
      {notice ? <p role="alert">{notice}</p> : null}
      <div className="gate-actions">
        <button type="button" onClick={onOpen}>
          Open
        </button>
        <button type="button" onClick={onCreate}>
          Create New
        </button>
        <button type="button" onClick={onImport}>
          Import Scrivener
        </button>
      </div>
      {settings}
    </main>
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
        <div className="dialog-actions">
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
