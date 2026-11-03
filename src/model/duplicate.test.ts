import assert from "node:assert/strict";
import { test } from "node:test";
import { editPreset } from "../bookCompile.ts";
import { addLeaf, addSection, duplicateDocument, moveToTrash } from "./binder.ts";
import type { EditorDoc } from "./editorDoc.ts";
import {
  createNovelProject,
  findNode,
  renameNode,
  setBookCompile,
  setDocumentContent,
  type BinderNode,
  type ProjectFile,
} from "./project.ts";

function textDoc(text: string): EditorDoc {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

function chapteredBook(): { project: ProjectFile; chapterId: string; sceneId: string } {
  const created = createNovelProject();
  const chapter = addSection(created, created.manuscript.id);
  let project = renameNode(chapter.project, chapter.id, "Chapter One");
  const opening = addLeaf(project, chapter.id);
  project = setDocumentContent(renameNode(opening.project, opening.id, "Opening"), opening.id, textDoc("Castus waited"));
  const road = addLeaf(project, opening.id);
  project = renameNode(road.project, road.id, "The road");
  return { project, chapterId: chapter.id, sceneId: opening.id };
}

function folder(node: BinderNode | undefined): Extract<BinderNode, { kind: "folder" }> {
  assert.equal(node?.kind, "folder");
  if (node?.kind !== "folder") {
    throw new Error("expected a folder");
  }
  return node;
}

test("a scene copies onto the next row and keeps its text", () => {
  const { project, chapterId, sceneId } = chapteredBook();
  const source = findNode(project, sceneId);
  assert.ok(source);
  const duplicated = duplicateDocument(project, sceneId);
  assert.ok(duplicated);
  const chapter = folder(findNode(duplicated.project, chapterId)?.node);
  assert.deepEqual(
    chapter.children.map((child) => child.title),
    ["Opening", "Copy of Opening", "The road"],
  );
  const copy = findNode(duplicated.project, duplicated.id);
  assert.ok(copy);
  assert.equal(copy.node.kind, "document");
  assert.equal(source.node.kind, "document");
  if (copy.node.kind !== "document" || source.node.kind !== "document") {
    throw new Error("expected documents");
  }
  assert.equal(copy.node.role, "scene");
  assert.notEqual(copy.node.id, source.node.id);
  assert.deepEqual(copy.node.content, source.node.content);
  assert.notEqual(copy.node.content, source.node.content);
  assert.ok(duplicated.project.compile.presets.every((preset) => preset.included.includes(duplicated.id)));
});

test("an unticked scene copies unticked", () => {
  const { project, sceneId } = chapteredBook();
  const preset = project.compile.presets[0];
  assert.ok(preset);
  const dropped = setBookCompile(
    project,
    editPreset(project.compile, preset.id, (item) => ({
      ...item,
      included: item.included.filter((entry) => entry !== sceneId),
    })),
  );
  const duplicated = duplicateDocument(dropped, sceneId);
  assert.ok(duplicated);
  const copyPreset = duplicated.project.compile.presets[0];
  assert.ok(copyPreset);
  assert.equal(copyPreset.included.includes(duplicated.id), false);
});

test("a note and a page copy under their own names", () => {
  const { project } = chapteredBook();
  const characters = project.notes.children[0];
  assert.ok(characters);
  const note = addLeaf(project, characters.id);
  const copiedNote = duplicateDocument(note.project, note.id);
  assert.ok(copiedNote);
  assert.equal(findNode(copiedNote.project, copiedNote.id)?.node.title, "Copy of New note");

  const front = folder(project.publishing.children[0]);
  const page = front.children[0];
  assert.ok(page);
  const copiedPage = duplicateDocument(project, page.id);
  assert.ok(copiedPage);
  const titles = folder(findNode(copiedPage.project, front.id)?.node).children.map((child) => child.title);
  assert.deepEqual(titles.slice(0, 2), [page.title, `Copy of ${page.title}`]);
});

test("a folder and a trashed scene do not copy", () => {
  const { project, chapterId, sceneId } = chapteredBook();
  assert.equal(duplicateDocument(project, chapterId), null);
  const trashed = moveToTrash(project, sceneId);
  assert.equal(duplicateDocument(trashed, sceneId), null);
});
