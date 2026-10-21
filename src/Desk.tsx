import type { ReactNode } from "react";
import Binder from "./Binder";
import {
  applyTrash,
  insertScene,
  insertSection,
  placeOpened,
  toggleSection,
} from "./binderActions";
import SceneEditor from "./SceneEditor";
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
import type { SaveState } from "./useBookFile";

type DeskProps = {
  project: ProjectFile;
  history: BookHistory | null;
  binderOpen: boolean;
  onBinderOpen: (open: boolean) => void;
  pendingTrash: string | null;
  onAskTrash: (id: string) => void;
  onPendingTrash: (id: string | null) => void;
  filePath: string | null;
  settingsOpen: boolean;
  onSettingsOpen: (open: boolean) => void;
  snapshotsOpen: boolean;
  onSnapshotsOpen: (open: boolean) => void;
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
  settingsOpen,
  onSettingsOpen,
  snapshotsOpen,
  onSnapshotsOpen,
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
              layout={project.layout}
              onLayout={(layout) => onProject((current) => setPageLayout(current, layout))}
              dictionary={project.dictionary}
              onAddWord={addWord}
              onRemoveWord={removeWord}
            />
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
      {snapshotsOpen ? (
        <Snapshots
          snapshotMinutes={snapshotMinutes}
          snapshots={history?.snapshots ?? []}
          onSnapshotMinutes={onSnapshotMinutes}
          onTakeSnapshot={onTakeSnapshot}
          onRestoreBook={onRestoreBook}
          onRestoreScene={onRestoreScene}
          onDeleteSnapshot={onDeleteSnapshot}
          onClose={() => onSnapshotsOpen(false)}
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
            aria-expanded={snapshotsOpen}
            onClick={() => onSnapshotsOpen(!snapshotsOpen)}
          >
            Snapshots
          </button>
          <span>{saveError ?? saveLabel(saveState)}</span>
        </span>
      </footer>
      {settingsOpen ? (
        <Settings
          dictionary={{ words: project.dictionary, onAddWord: addWord, onRemoveWord: removeWord }}
          onClose={() => onSettingsOpen(false)}
        />
      ) : null}
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
  return (
    <main className="gate">
      <h1>Manuscriptic</h1>
      {notice ? <p role="alert">{notice}</p> : null}
      {ready ? (
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
      ) : (
        <p>Opening project…</p>
      )}
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
