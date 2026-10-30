import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookFromArchive,
  filesToSave,
  importReplaceQuestion,
  newBook,
  recordedSnapshot,
  restoredBook,
  restoredScene,
} from "./bookSession.ts";
import { emptyHistory, filesForBook } from "./bookArchive.ts";
import { menuCommand } from "./menuCommand.ts";
import type { EditorDoc } from "./model/editorDoc.ts";
import { addLeaf } from "./model/binder.ts";
import { findNode, renameNode, renameProject, setDocumentContent, setView } from "./model/project.ts";
import { windowClose } from "./windows.ts";

test("a named book is a file, and a blank name is refused", () => {
  assert.equal(newBook("  "), null);
  const created = newBook("Act/One: Dawn");
  assert.ok(created);
  assert.equal(created?.title, "Act/One: Dawn");
  assert.equal(created?.fileName, "Act One Dawn.manuscriptic");
  assert.equal(created?.history.snapshots.length, 0);
  const opened = bookFromArchive(created?.files ?? {});
  assert.equal(opened.project.title, "Act/One: Dawn");
  assert.deepEqual(filesToSave(opened.project, opened.history)["binder.json"], created?.files["binder.json"]);
});

test("an unchanged book does not grow a snapshot, and a rename does", () => {
  const created = newBook("Castus");
  assert.ok(created);
  if (!created) {
    return;
  }
  assert.equal(recordedSnapshot(created.history, created.project, "manual", 1, "same"), null);
  const renamed = renameProject(created.project, "Castus Revised");
  const next = recordedSnapshot(created.history, renamed, "manual", 2, "renamed");
  assert.equal(next?.snapshots.length, 1);
  const restored = next ? restoredBook(next, "renamed") : { kind: "absent" as const };
  assert.equal(restored.kind, "ready");
  if (restored.kind === "ready") {
    assert.equal(restored.project.title, "Castus Revised");
  }
});

test("restoring a scene puts that snapshot's text back", () => {
  const created = newBook("Castus");
  assert.ok(created);
  if (!created) {
    return;
  }
  const opening = addLeaf(created.project, created.project.manuscript.id);
  const later = addLeaf(opening.project, created.project.manuscript.id);
  let project = setDocumentContent(later.project, opening.id, paragraph("Once"));
  project = setDocumentContent(project, later.id, paragraph("The gate."));
  project = setView(project, { selectedId: opening.id });
  const history = emptyHistory(filesForBook(project));
  const edited = setDocumentContent(project, later.id, paragraph("The gate stood open."));
  const snapped = recordedSnapshot(history, edited, "manual", 1, "early");
  assert.ok(snapped);
  if (!snapped) {
    return;
  }
  const rewritten = setDocumentContent(setView(edited, { selectedId: opening.id }), opening.id, paragraph("Twice"));
  const restored = restoredScene(snapped, rewritten, "early");
  assert.equal(restored.kind, "ready");
  if (restored.kind === "ready") {
    const node = findNode(restored.project, opening.id);
    assert.equal(node?.node.kind, "document");
    if (node?.node.kind === "document") {
      assert.deepEqual(node.node.content, paragraph("Once"));
    }
    const other = findNode(restored.project, later.id);
    assert.equal(other?.node.kind, "document");
    if (other?.node.kind === "document") {
      assert.deepEqual(other.node.content, paragraph("The gate stood open."));
    }
  }
  const folder = restoredScene(snapped, setView(rewritten, { selectedId: rewritten.manuscript.id }), "early");
  assert.deepEqual(folder, { kind: "notice", message: "Select a scene to restore." });
});

test("a scene written after a snapshot is named when it cannot be restored", () => {
  const created = newBook("Castus");
  assert.ok(created);
  if (!created) {
    return;
  }
  const opening = addLeaf(created.project, created.project.manuscript.id);
  let project = renameNode(setDocumentContent(opening.project, opening.id, paragraph("Once")), opening.id, "Opening");
  project = setView(project, { selectedId: opening.id });
  const history = recordedSnapshot(created.history, project, "manual", 1, "early");
  assert.ok(history);
  if (!history) {
    return;
  }
  const added = addLeaf(project, project.manuscript.id);
  project = renameNode(setDocumentContent(added.project, added.id, paragraph("Later")), added.id, "Classes");
  project = setView(project, { selectedId: added.id });
  assert.deepEqual(restoredScene(history, project, "early"), {
    kind: "notice",
    message: "Classes is not in this snapshot.",
  });
});

test("import warns that history and snapshots are lost", () => {
  assert.equal(
    importReplaceQuestion("/Books/Castus.manuscriptic"),
    "Importing a book replaces everything in this file, including snapshots. All history will be wiped.\n\n/Books/Castus.manuscriptic",
  );
});

test("a menu command is one of the known actions", () => {
  assert.deepEqual(menuCommand({ name: "save-as" }), { name: "save-as" });
  assert.deepEqual(menuCommand({ name: "compile" }), { name: "compile" });
  assert.deepEqual(menuCommand({ name: "book-settings" }), { name: "book-settings" });
  assert.deepEqual(menuCommand({ name: "import" }), { name: "import" });
  assert.deepEqual(menuCommand({ name: "undo" }), { name: "undo" });
  assert.deepEqual(menuCommand({ name: "redo" }), { name: "redo" });
  assert.deepEqual(menuCommand({ name: "format", command: "bold" }), { name: "format", command: "bold" });
  assert.deepEqual(menuCommand({ name: "align", align: "left" }), { name: "align", align: "left" });
  assert.equal(menuCommand({ name: "align", align: "nope" }), null);
  assert.equal(menuCommand({ name: "format", command: "nope" }), null);
  assert.equal(menuCommand({ name: "explode" }), null);
});

function paragraph(text: string): EditorDoc {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

test("the start screen closes, and the last book returns there", () => {
  assert.equal(windowClose(false, 1), "destroy");
  assert.equal(windowClose(false, 2), "destroy");
  assert.equal(windowClose(true, 1), "leave");
  assert.equal(windowClose(true, 2), "destroy");
});
