import { useState } from "react";
import { ROOT_KEYS, type BinderNode, type ProjectFile } from "./model/project";

type BinderProps = {
  project: ProjectFile;
  selectedId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onRenameProject: (title: string) => void;
  onAddScene: () => void;
  onAddFolder: () => void;
  onTrash: () => void;
  trashLabel: string;
  trashDisabled: boolean;
  onNewProject: () => Promise<void>;
};

export default function Binder({
  project,
  selectedId,
  expanded,
  onToggle,
  onSelect,
  onRenameProject,
  onAddScene,
  onAddFolder,
  onTrash,
  trashLabel,
  trashDisabled,
  onNewProject,
}: BinderProps) {
  const [confirmingNew, setConfirmingNew] = useState(false);

  return (
    <aside className="binder">
      <input
        className="project-title"
        aria-label="Project title"
        value={project.title}
        onChange={(event) => onRenameProject(event.currentTarget.value)}
      />
      <div className="tree">
        {ROOT_KEYS.map((key) => (
          <BinderBranch
            key={project[key].id}
            node={project[key]}
            depth={0}
            selectedId={selectedId}
            expanded={expanded}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
      </div>
      <div className="binder-actions">
        {confirmingNew ? (
          <div className="confirm-new">
            <p>Replace this novel with a blank one? The current book is copied to backups first.</p>
            <button
              type="button"
              onClick={() => {
                void onNewProject().then(
                  () => setConfirmingNew(false),
                  () => undefined,
                );
              }}
            >
              Replace
            </button>
            <button type="button" onClick={() => setConfirmingNew(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmingNew(true)}>
            New project
          </button>
        )}
        <button type="button" onClick={onAddScene}>
          New scene
        </button>
        <button type="button" onClick={onAddFolder}>
          New folder
        </button>
        <button type="button" onClick={onTrash} disabled={trashDisabled}>
          {trashLabel}
        </button>
      </div>
    </aside>
  );
}

type BranchProps = {
  node: BinderNode;
  depth: number;
  selectedId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
};

function BinderBranch({
  node,
  depth,
  selectedId,
  expanded,
  onToggle,
  onSelect,
}: BranchProps) {
  const open = expanded.has(node.id);
  const selected = node.id === selectedId;

  switch (node.kind) {
    case "folder":
      return (
        <div>
          <div className="tree-row" style={{ paddingLeft: 8 + depth * 14 }}>
            <button
              type="button"
              className={open ? "disclosure open" : "disclosure"}
              aria-label={open ? "Collapse folder" : "Expand folder"}
              onClick={() => onToggle(node.id)}
            />
            <button
              type="button"
              className={selected ? "tree-item selected" : "tree-item"}
              onClick={() => onSelect(node.id)}
            >
              {node.title}
            </button>
          </div>
          {open
            ? node.children.map((child) => (
                <BinderBranch
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  selectedId={selectedId}
                  expanded={expanded}
                  onToggle={onToggle}
                  onSelect={onSelect}
                />
              ))
            : null}
        </div>
      );
    case "document":
      return (
        <div className="tree-row" style={{ paddingLeft: 28 + depth * 14 }}>
          <button
            type="button"
            className={selected ? "tree-item selected" : "tree-item"}
            onClick={() => onSelect(node.id)}
          >
            {node.title}
          </button>
        </div>
      );
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}
