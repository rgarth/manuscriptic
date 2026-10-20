import { useState, type DragEvent, type MouseEvent } from "react";
import Hint from "./Hint.tsx";
import Icon, { type IconName } from "./icons";
import { dropAllowed, removal, type DropPlace } from "./model/binder";
import {
  isStoredInTrash,
  leafAction,
  ROOT_KEYS,
  type BinderNode,
  type DocumentRole,
  type ProjectFile,
  type RootKey,
} from "./model/project";

const rootIcons: Record<RootKey, IconName> = {
  manuscript: "book",
  notes: "note",
  publishing: "front",
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
  onRestore: (id: string) => void;
  onPlace: (id: string, targetId: string, place: DropPlace) => void;
  open: boolean;
  onToggleOpen: () => void;
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
  onRestore,
  onPlace,
  open,
  onToggleOpen,
}: BinderProps) {
  const [context, setContext] = useState<ContextMenu | null>(null);
  const [drop, setDrop] = useState<{ id: string; place: DropPlace } | null>(null);
  const selectedRemoval = selectedId ? removal(project, selectedId) : null;
  const leaf = leafAction(project, selectedId);

  return (
    <aside className={open ? "binder" : "binder collapsed"}>
      <div className="binder-bar">
        {open ? (
          <input
            className="project-title"
            aria-label="Project title"
            value={project.title}
            onChange={(event) => onRenameProject(event.currentTarget.value)}
          />
        ) : null}
        <Hint label={open ? "Hide the binder" : "Show the binder"}>
          <button
            type="button"
            className="binder-toggle"
            aria-label={open ? "Hide the binder" : "Show the binder"}
            aria-expanded={open}
            onClick={onToggleOpen}
          >
            <Icon name="menu" />
          </button>
        </Hint>
      </div>
      {open ? (
        <div className="tree">
          {ROOT_KEYS.map((key) => (
            <div key={project[key].id} className={key === "manuscript" ? "tree-manuscript" : undefined}>
              <BinderBranch
                node={project[key]}
                icon={rootIcons[key]}
                depth={0}
                selectedId={selectedId}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
                onContext={setContext}
                drop={drop}
                onDropTarget={setDrop}
                onPlace={onPlace}
                project={project}
              />
            </div>
          ))}
        </div>
      ) : null}
      {open && context ? (
        <BinderContextMenu
          project={project}
          context={context}
          onClose={() => setContext(null)}
          onAddScene={onAddScene}
          onAddSection={onAddSection}
          onAskTrash={onAskTrash}
          onRestore={onRestore}
        />
      ) : null}
      {open ? (
        <div className="binder-actions">
          <Hint label={leaf.hint}>
            <button type="button" className="binder-action" onClick={() => onAddScene()}>
              <Icon name={documentIcons[leaf.role]} />
              {leaf.label}
            </button>
          </Hint>
          <Hint label="Add a section">
            <button type="button" className="binder-action" onClick={() => onAddSection()}>
              <Icon name="section" />
              New section
            </button>
          </Hint>
          <Hint label={selectedRemoval?.label ?? "Move to Trash"}>
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
          </Hint>
        </div>
      ) : null}
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
  drop: { id: string; place: DropPlace } | null;
  onDropTarget: (drop: { id: string; place: DropPlace } | null) => void;
  onPlace: (id: string, targetId: string, place: DropPlace) => void;
  project: ProjectFile;
};

const documentIcons: Record<DocumentRole, IconName> = {
  scene: "scene",
  note: "note",
  page: "front",
};

const folderIcons: Record<string, IconName> = {
  Characters: "people",
  Places: "place",
  Research: "research",
  "Misc.": "note",
  "Front Matter": "front",
  "Back Matter": "front",
};

function folderIcon(title: string): IconName {
  return folderIcons[title] ?? "section";
}

let draggedId: string | null = null;

function dragBinderItem(event: DragEvent<HTMLButtonElement>, id: string) {
  draggedId = id;
  event.dataTransfer.setData("text/plain", id);
  event.dataTransfer.effectAllowed = "move";
}

function clearBinderDrag(onDropTarget: (drop: null) => void) {
  draggedId = null;
  onDropTarget(null);
}

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

function dropPlace(row: HTMLElement, kind: BinderNode["kind"], depth: number, clientY: number): DropPlace {
  if (depth === 0) {
    return "inside";
  }
  const rect = row.getBoundingClientRect();
  const ratio = rect.height === 0 ? 0.5 : (clientY - rect.top) / rect.height;
  if (kind === "document") {
    return ratio < 0.5 ? "before" : "after";
  }
  if (ratio < 0.28) {
    return "before";
  }
  if (ratio > 0.72) {
    return "after";
  }
  return "inside";
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
  drop,
  onDropTarget,
  onPlace,
  project,
}: BranchProps) {
  const open = expanded.has(node.id);
  const selected = node.id === selectedId;
  const marked = drop?.id === node.id ? drop.place : null;

  function dragOver(event: DragEvent<HTMLDivElement>) {
    if (!draggedId) {
      return;
    }
    const place = dropPlace(event.currentTarget, node.kind, depth, event.clientY);
    if (!dropAllowed(project, draggedId, node.id, place)) {
      onDropTarget(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    onDropTarget({ id: node.id, place });
  }

  function dropOn(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || draggedId;
    const place = dropPlace(event.currentTarget, node.kind, depth, event.clientY);
    const allowed = id !== null && id !== "" && dropAllowed(project, id, node.id, place);
    clearBinderDrag(onDropTarget);
    if (id && allowed) {
      onPlace(id, node.id, place);
    }
  }

  switch (node.kind) {
    case "folder":
      return (
        <div>
          <div
            className={marked ? `tree-row drop-${marked}` : "tree-row"}
            style={{ paddingLeft: 8 + depth * 16 }}
            onDragEnter={dragOver}
            onDragOver={dragOver}
            onDrop={dropOn}
          >
            <Hint label={open ? "Collapse section" : "Expand section"}>
              <button
                type="button"
                className={open ? "disclosure open" : "disclosure"}
                aria-label={open ? "Collapse section" : "Expand section"}
                onClick={() => onToggle(node.id)}
              >
                <Icon name="chevron" />
              </button>
            </Hint>
            <Hint label={node.title}>
              <button
                type="button"
                className={selected ? "tree-item selected" : "tree-item"}
                draggable={depth > 0}
                onClick={() => onSelect(node.id)}
                onDragStart={(event) => dragBinderItem(event, node.id)}
                onDragEnd={() => clearBinderDrag(onDropTarget)}
                onContextMenu={(event) => openContext(event, node.id, onSelect, onContext)}
              >
                <Icon name={icon ?? folderIcon(node.title)} />
                <span>{node.title}</span>
              </button>
            </Hint>
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
                  drop={drop}
                  onDropTarget={onDropTarget}
                  onPlace={onPlace}
                  project={project}
                />
              ))
            : null}
        </div>
      );
    case "document":
      return (
        <div
          className={marked ? `tree-row drop-${marked}` : "tree-row"}
          style={{ paddingLeft: 8 + depth * 16 }}
          onDragEnter={dragOver}
          onDragOver={dragOver}
          onDrop={dropOn}
        >
          <span className="disclosure-gap" />
          <Hint label={node.title}>
            <button
              type="button"
              className={selected ? "tree-item selected" : "tree-item"}
              draggable
              onClick={() => onSelect(node.id)}
              onDragStart={(event) => dragBinderItem(event, node.id)}
              onDragEnd={() => clearBinderDrag(onDropTarget)}
              onContextMenu={(event) => openContext(event, node.id, onSelect, onContext)}
            >
              <Icon name={documentIcons[node.role]} />
              <span>{node.title}</span>
            </button>
          </Hint>
        </div>
      );
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}

type MenuItem = {
  label: string;
  disabled?: boolean;
  run: () => void;
};

function contextItems(
  project: ProjectFile,
  id: string,
  onAddScene: (targetId?: string) => void,
  onAddSection: (targetId?: string) => void,
  onAskTrash: (id: string) => void,
  onRestore: (id: string) => void,
): MenuItem[] {
  if (id === project.trash.id) {
    const choice = removal(project, id);
    return [
      {
        label: choice?.label ?? "Empty Trash",
        disabled: choice === null,
        run: () => onAskTrash(id),
      },
    ];
  }
  if (isStoredInTrash(project, id)) {
    return [
      { label: "Restore", run: () => onRestore(id) },
      { label: "Delete Permanently", run: () => onAskTrash(id) },
    ];
  }
  const choice = removal(project, id);
  const leaf = leafAction(project, id);
  return [
    { label: leaf.menuLabel, run: () => onAddScene(id) },
    { label: "New Section", run: () => onAddSection(id) },
    {
      label: choice?.label ?? "Move to Trash",
      disabled: choice === null,
      run: () => onAskTrash(id),
    },
  ];
}

function BinderContextMenu({
  project,
  context,
  onClose,
  onAddScene,
  onAddSection,
  onAskTrash,
  onRestore,
}: {
  project: ProjectFile;
  context: ContextMenu;
  onClose: () => void;
  onAddScene: (targetId?: string) => void;
  onAddSection: (targetId?: string) => void;
  onAskTrash: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const items = contextItems(project, context.id, onAddScene, onAddSection, onAskTrash, onRestore);
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
