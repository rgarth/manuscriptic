import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookAt,
  bookFromFiles,
  emptyHistory,
  filesForBook,
  sceneAt,
  takeSnapshot,
  thinHistory,
  type BookHistory,
} from "./bookArchive.ts";
import type { EditorDoc } from "./model/editorDoc.ts";
import { addLeaf } from "./model/binder.ts";
import {
  createNovelProject,
  renameNode,
  setDocumentContent,
  setPageLayout,
  type ProjectFile,
} from "./model/project.ts";
import { decodeScene, encodeScene } from "./sceneText.ts";

const marked: EditorDoc = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", text: "The road was " },
        { type: "text", text: "long", marks: [{ type: "bold" }, { type: "italic" }] },
        { type: "hardBreak" },
        { type: "text", text: "[[and]] quiet.", marks: [{ type: "underline" }] },
      ],
    },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "two", marks: [{ type: "superscript" }] }] },
          ],
        },
      ],
    },
    {
      type: "orderedList",
      attrs: { start: 3 },
      content: [{ type: "listItem", content: [{ type: "paragraph" }] }],
    },
  ],
};

test("a scene keeps its marks, lists, and a literal bracket", () => {
  assert.deepEqual(decodeScene(encodeScene(marked)), marked);
});

test("a snapshot can put one scene back and leave the other alone", () => {
  const project = withScenes("Castus");
  const history = emptyHistory(filesForBook(project));
  const first = documentId(project, "Opening");
  const second = documentId(project, "Later");
  const edited = setDocumentContent(project, first, paragraph("A longer road."));
  const snapped = takeSnapshot(history, filesForBook(edited), "manual", 1_000, "snap-1");
  const both = setDocumentContent(edited, second, paragraph("The gate."));
  const again = takeSnapshot(snapped, filesForBook(both), "manual", 2_000, "snap-2");
  const restored = sceneAt(again, 0, first);
  assert.deepEqual(restored, paragraph("A longer road."));
  assert.equal(bookAt(again, 1)?.title, "Castus");
  const liveSecond = bookFromFiles(filesForBook(both));
  assert.deepEqual(contentOf(liveSecond, second), paragraph("The gate."));
});

test("page layout travels in the binder", () => {
  const project = setPageLayout(createNovelProject(), { font: "Palatino", points: 14, align: "left" });
  const opened = bookFromFiles(filesForBook(project));
  assert.equal(opened?.layout.font, "Palatino");
  assert.equal(opened?.layout.points, 14);
  assert.equal(opened?.layout.align, "left");
});

test("old automatic snapshots fold into the checkpoint and a manual one stays", () => {
  const project = withScenes("Castus");
  let history: BookHistory = emptyHistory(filesForBook(project));
  const id = documentId(project, "Opening");
  const hour = 60 * 60 * 1000;
  const now = 40 * 24 * hour;
  history = takeSnapshot(history, filesForBook(setDocumentContent(project, id, paragraph("one"))), "auto", now - 40 * 24 * hour, "old");
  history = takeSnapshot(history, filesForBook(setDocumentContent(project, id, paragraph("two"))), "manual", now - 10 * 24 * hour, "kept");
  history = takeSnapshot(history, filesForBook(setDocumentContent(project, id, paragraph("three"))), "auto", now - 30 * 60 * 1000, "recent");
  const thinned = thinHistory(history, now);
  assert.deepEqual(
    thinned.snapshots.map((snapshot) => snapshot.id),
    ["kept", "recent"],
  );
  assert.deepEqual(sceneAt(thinned, 0, id), paragraph("two"));
  assert.equal(bookFromFiles(thinned.checkpoint)?.title, "Castus");
});

function withScenes(title: string): ProjectFile {
  let project = { ...createNovelProject(), title };
  const manuscript = project.manuscript.id;
  project = namedScene(project, manuscript, "Opening");
  return namedScene(project, manuscript, "Later");
}

function namedScene(project: ProjectFile, parentId: string, title: string): ProjectFile {
  const inserted = addLeaf(project, parentId);
  return renameNode(inserted.project, inserted.id, title);
}

function documentId(project: ProjectFile, title: string): string {
  const found = [project.manuscript, project.notes, project.publishing, project.trash]
    .flatMap((root) => root.children)
    .find((node) => node.title === title);
  if (!found) {
    throw new Error(title);
  }
  return found.id;
}

function paragraph(text: string): EditorDoc {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

function contentOf(project: ProjectFile | null, id: string): EditorDoc | null {
  if (!project) {
    return null;
  }
  const node = project.manuscript.children.find((child) => child.id === id);
  return node?.kind === "document" ? node.content : null;
}
