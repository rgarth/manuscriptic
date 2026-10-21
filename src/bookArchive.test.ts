import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookAt,
  bookFromFiles,
  bookPatch,
  emptyHistory,
  filesForBook,
  planSave,
  rememberSave,
  type BookHistory,
  type DiskHistory,
  sceneAt,
  takeSnapshot,
  thinHistory,
} from "./bookArchive.ts";
import type { EditorDoc } from "./model/editorDoc.ts";
import { addLeaf } from "./model/binder.ts";
import {
  createNovelProject,
  documentNode,
  renameNode,
  setDocumentContent,
  setPageLayout,
  type ProjectFile,
} from "./model/project.ts";
import { projectFromImport } from "./importedBook.ts";
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

test("a save sends the scene that changed and keeps the rest", () => {
  const stored = {
    "binder.json": "{\"title\":\"Castus\"}\n",
    "scenes/opening.prose": "p One\n",
    "history.json": "{\"snapshots\":[]}\n",
  };
  const next = {
    ...stored,
    "binder.json": "{\"title\":\"Castus\"}\n",
    "scenes/opening.prose": "p Two\n",
  };
  const patch = bookPatch(stored, next);
  assert.deepEqual(patch.files, { "scenes/opening.prose": "p Two\n" });
  assert.deepEqual(patch.keep.sort(), ["binder.json", "history.json"]);
  assert.equal(patch.rewrite, true);
  const held = planSave(stored, { ...next, "history.json": "{\"snapshots\":[1]}\n" }, { phase: "unread" });
  assert.equal(held.files["history.json"], undefined);
  assert.equal(held.keep.includes("history.json"), true);
});

test("a keystroke before history arrives does not replace the history that lands", () => {
  const pages = {
    "binder.json": "{\"title\":\"Castus\"}\n",
    "scenes/opening.prose": "p One\n",
  };
  const generated = {
    ...pages,
    "scenes/opening.prose": "p Two\n",
    "history.json": "{\"snapshots\":[]}\n",
  };
  const unread: DiskHistory = { phase: "unread" };
  const patch = planSave(pages, generated, unread);
  assert.equal(patch.files["history.json"], undefined);
  assert.equal(patch.keep.includes("history.json"), true);
  assert.equal(patch.files["scenes/opening.prose"], "p Two\n");

  const blank: BookHistory = { checkpoint: {}, snapshots: [] };
  const kept = "{\"snapshots\":[\"kept\"]}\n";
  const ready: DiskHistory = { phase: "ready", history: blank, text: kept };
  const remembered = rememberSave({ ...pages, "history.json": kept }, generated, unread, ready, blank);
  assert.equal(remembered.files["history.json"], kept);
  assert.equal(remembered.files["scenes/opening.prose"], "p Two\n");
  assert.equal(remembered.disk, ready);
  const waiting = rememberSave(pages, generated, unread, unread, blank);
  assert.equal(waiting.files["history.json"], undefined);
  assert.equal(waiting.disk.phase, "unread");
  const written = rememberSave(pages, generated, { phase: "absent" }, { phase: "absent" }, blank);
  assert.equal(written.files["history.json"], "{\"snapshots\":[]}\n");
  assert.deepEqual(written.disk, { phase: "ready", history: blank, text: "{\"snapshots\":[]}\n" });
});

test("page layout travels in the binder", () => {
  const project = setPageLayout(createNovelProject(), { font: "Palatino", points: 14, align: "left" });
  const opened = bookFromFiles(filesForBook(project));
  assert.equal(opened?.layout.font, "Palatino");
  assert.equal(opened?.layout.points, 14);
  assert.equal(opened?.layout.align, "left");
});

test("a replaced front matter round-trips without the empty starter pages", () => {
  const project = projectFromImport({
    title: "Bone Eaters",
    manuscript: [documentNode("Opening", "scene")],
    notes: null,
    extraNotes: [],
    frontMatter: [documentNode("Title Page", "page")],
    backMatter: null,
    trash: [],
  });
  const opened = bookFromFiles(filesForBook(project));
  assert.ok(opened);
  const front = opened.publishing.children.find((child) => child.title === "Front Matter");
  assert.equal(front?.kind, "folder");
  if (front?.kind === "folder") {
    assert.deepEqual(
      front.children.map((child) => child.title),
      ["Title Page"],
    );
  }
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
