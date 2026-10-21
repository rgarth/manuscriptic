import {
  addLeaf,
  addSection,
  deleteForever,
  emptyTrash,
  moveToTrash,
  placeNode,
  type DropPlace,
  type Removal,
} from "./model/binder";
import { findNode, openFolders, setView, type ProjectFile } from "./model/project";

export function selectInserted(project: ProjectFile, id: string): ProjectFile {
  const located = findNode(project, id);
  const open = new Set(project.view.expanded ?? openFolders(project));
  if (located?.parent) {
    open.add(located.parent.id);
  }
  if (located?.node.kind === "folder") {
    open.add(located.node.id);
  }
  return setView(project, { selectedId: id, expanded: [...open] });
}

export function insertScene(project: ProjectFile, targetId: string | null): ProjectFile {
  const inserted = addLeaf(project, targetId);
  return selectInserted(inserted.project, inserted.id);
}

export function insertSection(project: ProjectFile, targetId: string | null): ProjectFile {
  const inserted = addSection(project, targetId);
  return selectInserted(inserted.project, inserted.id);
}

export function toggleSection(project: ProjectFile, id: string): ProjectFile {
  const open = new Set(project.view.expanded ?? openFolders(project));
  if (open.has(id)) {
    open.delete(id);
  } else {
    open.add(id);
  }
  return setView(project, { expanded: [...open] });
}

export function placeOpened(
  project: ProjectFile,
  id: string,
  targetId: string,
  place: DropPlace,
): ProjectFile {
  const next = placeNode(project, id, targetId, place);
  if (place !== "inside") {
    return next;
  }
  const open = new Set(next.view.expanded ?? openFolders(next));
  open.add(targetId);
  return setView(next, { expanded: [...open] });
}

export function applyTrash(
  project: ProjectFile,
  id: string,
  action: Removal["action"],
  selectedId: string | null,
): ProjectFile {
  switch (action) {
    case "delete": {
      const parent = findNode(project, id)?.parent;
      return setView(deleteForever(project, id), {
        selectedId: parent?.id ?? project.trash.id,
      });
    }
    case "empty": {
      const next = emptyTrash(project);
      const selected = selectedId && findNode(next, selectedId) ? selectedId : next.trash.id;
      return setView(next, { selectedId: selected });
    }
    case "move":
      return moveToTrash(project, id);
    default: {
      const unexpected: never = action;
      return unexpected;
    }
  }
}
