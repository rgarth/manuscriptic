import {
  assignRole,
  contains,
  documentNode,
  editNode,
  findNode,
  folderNode,
  isRoot,
  isStoredInTrash,
  leafAction,
  leafCopy,
  roleForRoot,
  ROOT_KEYS,
  type BinderNode,
  type InsertedNode,
  type LocatedNode,
  type ProjectFile,
  type RootKey,
  type TrashOrigin,
} from "./project.ts";

export type Removal = {
  action: "move" | "delete" | "empty";
  title: string;
  folder: boolean;
  label: string;
  message: string;
};

export type DropPlace = "before" | "after" | "inside";

export function addLeaf(project: ProjectFile, selectedId: string | null): InsertedNode {
  const action = leafAction(project, selectedId);
  return addNode(project, selectedId, documentNode(action.label, action.role));
}

export function addSection(project: ProjectFile, selectedId: string | null): InsertedNode {
  return addNode(project, selectedId, folderNode("New section"));
}

export function removal(project: ProjectFile, id: string): Removal | null {
  if (id === project.trash.id) {
    if (project.trash.children.length === 0) {
      return null;
    }
    return {
      action: "empty",
      title: project.trash.title,
      folder: true,
      label: "Empty Trash",
      message: "Empty the trash? Everything in it is deleted permanently.",
    };
  }
  if (isRoot(project, id)) {
    return null;
  }
  const located = findNode(project, id);
  if (!located) {
    return null;
  }
  const title = located.node.title;
  const folder = located.node.kind === "folder";
  if (isStoredInTrash(project, id)) {
    return {
      action: "delete",
      title,
      folder,
      label: "Delete Permanently",
      message: folder
        ? `Delete “${title}” and everything inside it? This cannot be undone.`
        : `Delete “${title}”? This cannot be undone.`,
    };
  }
  const plural = leafCopy[roleForRoot[located.root]].plural;
  return {
    action: "move",
    title,
    folder,
    label: "Move to Trash",
    message: folder
      ? `Move “${title}” to the trash? Its sections and ${plural} move with it.`
      : `Move “${title}” to the trash?`,
  };
}

export function placeNode(
  project: ProjectFile,
  id: string,
  targetId: string,
  place: DropPlace,
): ProjectFile {
  if (id === targetId || isRoot(project, id)) {
    return project;
  }
  const moving = findNode(project, id);
  const target = findNode(project, targetId);
  if (!moving || !target || contains(moving.node, targetId)) {
    return project;
  }
  const landing = dropLanding(target, moving.node.id, place);
  if (!landing) {
    return project;
  }
  return relocate(project, moving, landing.parentId, landing.index);
}

export function moveToTrash(project: ProjectFile, id: string): ProjectFile {
  if (isRoot(project, id) || isStoredInTrash(project, id)) {
    return project;
  }
  return placeNode(project, id, project.trash.id, "inside");
}

export function restoreNode(project: ProjectFile, id: string): ProjectFile {
  if (isRoot(project, id) || !isStoredInTrash(project, id)) {
    return project;
  }
  const moving = findNode(project, id);
  if (!moving) {
    return project;
  }
  const origin = moving.node.origin;
  const removed = removeFromProject(project, id);
  if (!removed.node) {
    return project;
  }
  const node = setOrigin(removed.node, undefined);
  const parent = origin ? findNode(removed.project, origin.parentId) : null;
  if (
    origin &&
    parent &&
    parent.node.kind === "folder" &&
    parent.root !== "trash" &&
    !contains(node, parent.node.id)
  ) {
    return insertNode(removed.project, parent.node.id, node, origin.index) ?? project;
  }
  const root = origin && origin.root !== "trash" ? origin.root : homeRoot(node);
  const home = removed.project[root];
  return insertNode(removed.project, home.id, node, home.children.length) ?? project;
}

export function emptyTrash(project: ProjectFile): ProjectFile {
  if (project.trash.children.length === 0) {
    return project;
  }
  return { ...project, trash: { ...project.trash, children: [] } };
}

export function deleteForever(project: ProjectFile, id: string): ProjectFile {
  if (isRoot(project, id) || !isStoredInTrash(project, id)) {
    return project;
  }
  return removeFromProject(project, id).project;
}

function addNode(project: ProjectFile, selectedId: string | null, child: BinderNode): InsertedNode {
  const located = selectedId ? findNode(project, selectedId) : null;
  const afterId =
    child.kind === "document" && located?.node.kind === "document" ? located.node.id : undefined;
  const parentId =
    located && afterId && located.parent
      ? located.parent.id
      : destinationId(project, selectedId);
  const parent = findNode(project, parentId);
  if (!parent || parent.node.kind !== "folder") {
    throw new Error("Could not insert into the binder.");
  }
  const after = afterId ? parent.node.children.findIndex((item) => item.id === afterId) : -1;
  const index = after >= 0 ? after + 1 : parent.node.children.length;
  const next = insertNode(project, parentId, child, index);
  if (!next) {
    throw new Error("Could not insert into the binder.");
  }
  return { project: next, id: child.id };
}

function destinationId(project: ProjectFile, selectedId: string | null): string {
  if (!selectedId) {
    return project.manuscript.id;
  }
  const located = findNode(project, selectedId);
  if (!located) {
    return project.manuscript.id;
  }
  switch (located.node.kind) {
    case "folder":
      return located.node.id;
    case "document":
      return located.parent?.id ?? project.manuscript.id;
    default: {
      const unexpected: never = located.node;
      return unexpected;
    }
  }
}

function dropLanding(
  target: LocatedNode,
  movingId: string,
  place: DropPlace,
): { parentId: string; index: number } | null {
  switch (place) {
    case "inside":
      if (target.node.kind !== "folder") {
        return null;
      }
      return {
        parentId: target.node.id,
        index: indexAfterRemoval(target.node.children, movingId, target.node.children.length),
      };
    case "before":
    case "after": {
      if (!target.parent) {
        return null;
      }
      const siblings = target.parent.children;
      const targetIndex = siblings.findIndex((child) => child.id === target.node.id);
      const raw = place === "before" ? targetIndex : targetIndex + 1;
      return {
        parentId: target.parent.id,
        index: indexAfterRemoval(siblings, movingId, raw),
      };
    }
    default: {
      const unexpected: never = place;
      return unexpected;
    }
  }
}

function indexAfterRemoval(children: BinderNode[], movingId: string, index: number): number {
  const from = children.findIndex((child) => child.id === movingId);
  return from >= 0 && from < index ? index - 1 : index;
}

function relocate(
  project: ProjectFile,
  moving: LocatedNode,
  parentId: string,
  index: number,
): ProjectFile {
  const removed = removeFromProject(project, moving.node.id);
  if (!removed.node) {
    return project;
  }
  const parent = findNode(removed.project, parentId);
  if (!parent || parent.node.kind !== "folder") {
    return project;
  }
  const child = nodeForDestination(removed.node, moving, parent);
  return insertNode(removed.project, parentId, child, index) ?? project;
}

function nodeForDestination(
  node: BinderNode,
  moving: LocatedNode,
  parent: LocatedNode,
): BinderNode {
  if (parent.root === "trash") {
    const from = moving.parent;
    if (moving.root === "trash" || !from) {
      return node;
    }
    return setOrigin(node, {
      parentId: from.id,
      index: from.children.findIndex((child) => child.id === moving.node.id),
      root: moving.root,
    });
  }
  const cleared = setOrigin(node, undefined);
  if (parent.root === moving.root) {
    return cleared;
  }
  return adoptRoot(cleared, parent.root);
}

function setOrigin(node: BinderNode, origin: TrashOrigin | undefined): BinderNode {
  if (origin) {
    return { ...node, origin };
  }
  if (!node.origin) {
    return node;
  }
  const { origin: _origin, ...rest } = node;
  return rest;
}

function homeRoot(node: BinderNode): RootKey {
  switch (node.kind) {
    case "document":
      switch (node.role) {
        case "note":
          return "notes";
        case "page":
          return "publishing";
        case "scene":
          return "manuscript";
        default: {
          const unexpected: never = node.role;
          return unexpected;
        }
      }
    case "folder":
      return "manuscript";
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}

function adoptRoot(node: BinderNode, root: RootKey): BinderNode {
  const role = roleForRoot[root];
  return assignRole(node, role, role !== "note");
}

function insertNode(
  project: ProjectFile,
  parentId: string,
  child: BinderNode,
  index: number,
): ProjectFile | null {
  const parent = findNode(project, parentId);
  if (!parent || parent.node.kind !== "folder") {
    return null;
  }
  return editNode(project, parentId, (node) => {
    switch (node.kind) {
      case "folder": {
        const children = [...node.children];
        const at = Math.max(0, Math.min(index, children.length));
        children.splice(at, 0, child);
        return { ...node, children };
      }
      case "document":
        return node;
      default: {
        const unexpected: never = node;
        return unexpected;
      }
    }
  });
}

function removeFromProject(
  project: ProjectFile,
  id: string,
): { project: ProjectFile; node: BinderNode | null } {
  const next = { ...project };
  let removed: BinderNode | null = null;
  for (const key of ROOT_KEYS) {
    const result = removeNode(project[key], id);
    if (result.node.kind !== "folder") {
      return { project, node: null };
    }
    next[key] = result.node;
    if (result.removed) {
      removed = result.removed;
    }
  }
  return { project: next, node: removed };
}

function removeNode(
  node: BinderNode,
  id: string,
): { node: BinderNode; removed: BinderNode | null } {
  switch (node.kind) {
    case "document":
      return { node, removed: null };
    case "folder": {
      let removed: BinderNode | null = null;
      const children: BinderNode[] = [];
      let changed = false;
      for (const child of node.children) {
        if (child.id === id) {
          removed = child;
          changed = true;
          continue;
        }
        const nested = removeNode(child, id);
        if (nested.removed) {
          removed = nested.removed;
          changed = true;
        }
        children.push(nested.node);
      }
      if (!changed) {
        return { node, removed: null };
      }
      return { node: { ...node, children }, removed };
    }
    default: {
      const unexpected: never = node;
      return { node: unexpected, removed: null };
    }
  }
}
