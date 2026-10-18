import type { BinderNode, ProjectFile } from "./model/project";

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
}: BinderProps) {
  return (
    <aside className="binder">
      <input
        className="project-title"
        aria-label="Project title"
        value={project.title}
        onChange={(event) => onRenameProject(event.currentTarget.value)}
      />
      <div className="tree">
        <BinderBranch
          node={project.manuscript}
          depth={0}
          selectedId={selectedId}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
        />
        <BinderBranch
          node={project.characters}
          depth={0}
          selectedId={selectedId}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
        />
        <BinderBranch
          node={project.places}
          depth={0}
          selectedId={selectedId}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
        />
        <BinderBranch
          node={project.frontMatter}
          depth={0}
          selectedId={selectedId}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
        />
        <BinderBranch
          node={project.research}
          depth={0}
          selectedId={selectedId}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
        />
        <BinderBranch
          node={project.trash}
          depth={0}
          selectedId={selectedId}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      </div>
      <div className="binder-actions">
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
      const unexpected: never = node.kind;
      return unexpected;
    }
  }
}
