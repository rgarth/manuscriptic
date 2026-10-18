import { useState, type MouseEvent } from "react";
import Icon, { type IconName } from "./icons";
import {
  removal,
  ROOT_KEYS,
  type BinderNode,
  type ProjectFile,
  type RootKey,
} from "./model/project";

const rootIcons: Record<RootKey, IconName> = {
  manuscript: "book",
  characters: "people",
  places: "place",
  frontMatter: "front",
  research: "research",
  trash: "trash",
};

type BinderProps = {
  project: ProjectFile;
  selectedId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onRenameProject: (title: string) => void;
  onAddScene: (targetId?: string) => void;
  onAddSection: (targetId?: string) => void;
  onAskTrash: (id: string) => void;
};

export default function Binder({
  project,
  selectedId,
  expanded,
  onToggle,
  onSelect,
  onRenameProject,
  onAddScene,
  onAddSection,
  onAskTrash,
}: BinderProps) {
  const [context, setContext] = useState<ContextMenu | null>(null);
  const selectedRemoval = selectedId ? removal(project, selectedId) : null;

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
            icon={rootIcons[key]}
            depth={0}
            selectedId={selectedId}
            expanded={expanded}
            onToggle={onToggle}
            onSelect={onSelect}
            onContext={setContext}
          />
        ))}
      </div>
      {context ? (
        <BinderContextMenu
          project={project}
          context={context}
          onClose={() => setContext(null)}
          onAddScene={onAddScene}
          onAddSection={onAddSection}
          onAskTrash={onAskTrash}
        />
      ) : null}
      <div className="binder-actions">
        <button type="button" className="binder-action" onClick={() => onAddScene()}>
          <Icon name="scene" />
          New scene
        </button>
        <button type="button" className="binder-action" onClick={() => onAddSection()}>
          <Icon name="section" />
          New section
        </button>
        <button
          type="button"
          className="binder-action"
          onClick={() => {
            if (selectedId) {
              onAskTrash(selectedId);
            }
          }}
          disabled={selectedRemoval === null}
        >
          <Icon name="trash" />
          {selectedRemoval?.label ?? "Move to Trash"}
        </button>
      </div>
    </aside>
  );
}

type ContextMenu = {
  id: string;
  x: number;
  y: number;
};

type BranchProps = {
  node: BinderNode;
  icon?: IconName;
  depth: number;
  selectedId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onContext: (menu: ContextMenu) => void;
};

function openContext(
  event: MouseEvent,
  id: string,
  onSelect: (id: string) => void,
  onContext: (menu: ContextMenu) => void,
) {
  event.preventDefault();
  onSelect(id);
  onContext({
    id,
    x: Math.min(event.clientX, window.innerWidth - 196),
    y: Math.min(event.clientY, window.innerHeight - 132),
  });
}

function BinderBranch({
  node,
  icon,
  depth,
  selectedId,
  expanded,
  onToggle,
  onSelect,
  onContext,
}: BranchProps) {
  const open = expanded.has(node.id);
  const selected = node.id === selectedId;

  switch (node.kind) {
    case "folder":
      return (
        <div>
          <div className="tree-row" style={{ paddingLeft: 8 + depth * 16 }}>
            <button
              type="button"
              className={open ? "disclosure open" : "disclosure"}
              aria-label={open ? "Collapse section" : "Expand section"}
              onClick={() => onToggle(node.id)}
            >
              <Icon name="chevron" />
            </button>
            <button
              type="button"
              className={selected ? "tree-item selected" : "tree-item"}
              onClick={() => onSelect(node.id)}
              onContextMenu={(event) => openContext(event, node.id, onSelect, onContext)}
            >
              <Icon name={icon ?? "section"} />
              <span>{node.title}</span>
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
                  onContext={onContext}
                />
              ))
            : null}
        </div>
      );
    case "document":
      return (
        <div className="tree-row" style={{ paddingLeft: 8 + depth * 16 }}>
          <span className="disclosure-gap" />
          <button
            type="button"
            className={selected ? "tree-item selected" : "tree-item"}
            onClick={() => onSelect(node.id)}
            onContextMenu={(event) => openContext(event, node.id, onSelect, onContext)}
          >
            <Icon name="scene" />
            <span>{node.title}</span>
          </button>
        </div>
      );
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}

function BinderContextMenu({
  project,
  context,
  onClose,
  onAddScene,
  onAddSection,
  onAskTrash,
}: {
  project: ProjectFile;
  context: ContextMenu;
  onClose: () => void;
  onAddScene: (targetId?: string) => void;
  onAddSection: (targetId?: string) => void;
  onAskTrash: (id: string) => void;
}) {
  const choice = removal(project, context.id);
  const items = [
    { label: "New Scene", disabled: false, run: () => onAddScene(context.id) },
    { label: "New Section", disabled: false, run: () => onAddSection(context.id) },
    {
      label: choice?.label ?? "Move to Trash",
      disabled: choice === null,
      run: () => onAskTrash(context.id),
    },
  ];
  return (
    <>
      <button type="button" className="menu-dismiss" aria-label="Close menu" onClick={onClose} />
      <div className="context-menu" style={{ left: context.x, top: context.y }} role="menu">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.run();
              onClose();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>
  );
}
