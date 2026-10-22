import { findNode, type BinderNode, type FolderNode, type ProjectFile } from "./model/project.ts";

export type CompileRow = {
  id: string;
  title: string;
  depth: number;
  kind: "folder" | "document";
};

export function compileRows(project: ProjectFile): CompileRow[] {
  const rows: CompileRow[] = [];
  appendRow(project.manuscript, 0, rows);
  for (const child of project.publishing.children) {
    appendRow(child, 0, rows);
  }
  return rows;
}

export function collapsedCompileFolders(rows: readonly CompileRow[]): Set<string> {
  return new Set(rows.filter((row) => row.kind === "folder").map((row) => row.id));
}

export function shownCompileRows(rows: readonly CompileRow[], collapsed: ReadonlySet<string>): CompileRow[] {
  const shown: CompileRow[] = [];
  let hiddenDepth = -1;
  for (const row of rows) {
    if (hiddenDepth >= 0 && row.depth > hiddenDepth) {
      continue;
    }
    hiddenDepth = -1;
    shown.push(row);
    if (row.kind === "folder" && collapsed.has(row.id)) {
      hiddenDepth = row.depth;
    }
  }
  return shown;
}

export function initialCompileTicks(project: ProjectFile): Set<string> {
  const ticks = new Set<string>();
  for (const row of compileRows(project)) {
    const found = findNode(project, row.id);
    if (found?.node.includeInCompile) {
      ticks.add(row.id);
    }
  }
  return ticks;
}

export function toggleCompileRow(project: ProjectFile, included: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(included);
  const found = findNode(project, id);
  if (!found || !compileRows(project).some((row) => row.id === id)) {
    return next;
  }
  const turningOn = !next.has(id);
  if (turningOn) {
    for (const item of subtreeIds(found.node)) {
      next.add(item);
    }
    for (const ancestor of ancestorIds(project, id)) {
      next.add(ancestor);
    }
  } else {
    for (const item of subtreeIds(found.node)) {
      next.delete(item);
    }
  }
  return next;
}

export function rememberCompile(project: ProjectFile, included: ReadonlySet<string>): ProjectFile {
  const listed = new Set(compileRows(project).map((row) => row.id));
  const manuscript = flagListed(project.manuscript, listed, included);
  const publishing = flagListed(project.publishing, listed, included);
  if (manuscript === project.manuscript && publishing === project.publishing) {
    return project;
  }
  return { ...project, manuscript, publishing };
}

function appendRow(node: BinderNode, depth: number, rows: CompileRow[]) {
  rows.push({ id: node.id, title: node.title, depth, kind: node.kind });
  if (node.kind === "folder") {
    for (const child of node.children) {
      appendRow(child, depth + 1, rows);
    }
  }
}

function subtreeIds(node: BinderNode): string[] {
  const ids: string[] = [];
  appendIds(node, ids);
  return ids;
}

function appendIds(node: BinderNode, ids: string[]) {
  ids.push(node.id);
  if (node.kind === "folder") {
    for (const child of node.children) {
      appendIds(child, ids);
    }
  }
}

function ancestorIds(project: ProjectFile, id: string): string[] {
  const listed = new Set(compileRows(project).map((row) => row.id));
  const ids: string[] = [];
  let current = findNode(project, id);
  while (current?.parent) {
    if (listed.has(current.parent.id)) {
      ids.push(current.parent.id);
    }
    current = findNode(project, current.parent.id);
  }
  return ids;
}

function flagListed(node: FolderNode, listed: ReadonlySet<string>, included: ReadonlySet<string>): FolderNode;
function flagListed(node: BinderNode, listed: ReadonlySet<string>, included: ReadonlySet<string>): BinderNode;
function flagListed(node: BinderNode, listed: ReadonlySet<string>, included: ReadonlySet<string>): BinderNode {
  const includeInCompile = listed.has(node.id) ? included.has(node.id) : node.includeInCompile;
  switch (node.kind) {
    case "document":
      return includeInCompile === node.includeInCompile ? node : { ...node, includeInCompile };
    case "folder": {
      let childrenChanged = false;
      const children = node.children.map((child) => {
        const next = flagListed(child, listed, included);
        if (next !== child) {
          childrenChanged = true;
        }
        return next;
      });
      if (!childrenChanged && includeInCompile === node.includeInCompile) {
        return node;
      }
      return { ...node, includeInCompile, children };
    }
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}
