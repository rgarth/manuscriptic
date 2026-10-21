import {
  createNovelProject,
  firstDocumentId,
  folderIds,
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

export function projectFromImport(imported: ImportedBook): ProjectFile {
  const base = renameProject(createNovelProject(), imported.title.trim() || "Imported Novel");
  const noteChildren = imported.notes === null ? base.notes.children : imported.notes;
  let project: ProjectFile = {
    ...base,
    manuscript: { ...base.manuscript, children: imported.manuscript },
    notes: { ...base.notes, children: [...noteChildren, ...imported.extraNotes] },
    trash: { ...base.trash, children: imported.trash },
  };
  if (imported.frontMatter) {
    project = replaceMatter(project, "front", imported.frontMatter);
  }
  if (imported.backMatter) {
    project = replaceMatter(project, "back", imported.backMatter);
  }
  return setView(project, {
    selectedId: firstDocumentId(project.manuscript) ?? project.manuscript.id,
    expanded: folderIds(project),
  });
}
