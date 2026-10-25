import {
  createNovelProject,
  firstDocumentId,
  openFolders,
  renameProject,
  replaceMatter,
  setView,
  type BinderNode,
  type ProjectFile,
} from "./model/project.ts";

export type ImportedBook = {
  title: string;
  manuscript: BinderNode[];
  notes: BinderNode[] | null;
  extraNotes: BinderNode[];
  frontMatter: BinderNode[] | null;
  backMatter: BinderNode[] | null;
  trash: BinderNode[];
};

export function projectFromImport(imported: ImportedBook, keepStarters: boolean): ProjectFile {
  const base = renameProject(createNovelProject(), imported.title.trim() || "Imported Novel");
  const noteChildren = imported.notes === null ? base.notes.children : imported.notes;
  let project: ProjectFile = {
    ...base,
    manuscript: { ...base.manuscript, children: imported.manuscript },
    notes: { ...base.notes, children: [...noteChildren, ...imported.extraNotes] },
    trash: { ...base.trash, children: imported.trash },
  };
  project = applyMatter(project, "front", imported.frontMatter, keepStarters);
  project = applyMatter(project, "back", imported.backMatter, keepStarters);
  const opened = setView(project, { expanded: null });
  return setView(opened, {
    selectedId: firstDocumentId(opened.manuscript) ?? opened.manuscript.id,
    expanded: openFolders(opened),
  });
}

function applyMatter(
  project: ProjectFile,
  section: "front" | "back",
  imported: BinderNode[] | null,
  keepStarters: boolean,
): ProjectFile {
  const pages = imported ?? [];
  if (!keepStarters) {
    return replaceMatter(project, section, pages);
  }
  if (pages.length === 0) {
    return project;
  }
  const folder = project.publishing.children.find((child) => child.kind === "folder" && child.matter === section);
  const starters = folder?.kind === "folder" ? folder.children.map(untick) : [];
  return replaceMatter(project, section, [...pages, ...starters]);
}

function untick(node: BinderNode): BinderNode {
  switch (node.kind) {
    case "document":
      return { ...node, includeInCompile: false };
    case "folder":
      return { ...node, includeInCompile: false, children: node.children.map(untick) };
    default: {
      const unexpected: never = node;
      return unexpected;
    }
  }
}
