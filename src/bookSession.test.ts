import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookFromArchive,
  filesToSave,
  importReplaceQuestion,
  newBook,
  recordedSnapshot,
  restoredBook,
} from "./bookSession.ts";
import { menuCommand } from "./menuCommand.ts";
import { renameProject } from "./model/project.ts";
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

test("import warns that history and snapshots are lost", () => {
  assert.equal(
    importReplaceQuestion("/Books/Castus.manuscriptic"),
    "Importing a book replaces everything in this file, including snapshots. All history will be wiped.\n\n/Books/Castus.manuscriptic",
  );
});

test("a menu command is one of the known actions", () => {
  assert.deepEqual(menuCommand({ name: "save-as" }), { name: "save-as" });
  assert.deepEqual(menuCommand({ name: "import" }), { name: "import" });
  assert.deepEqual(menuCommand({ name: "format", command: "bold" }), { name: "format", command: "bold" });
  assert.deepEqual(menuCommand({ name: "align", align: "left" }), { name: "align", align: "left" });
  assert.equal(menuCommand({ name: "align", align: "nope" }), null);
  assert.equal(menuCommand({ name: "format", command: "nope" }), null);
  assert.equal(menuCommand({ name: "explode" }), null);
});

test("the start screen closes, and the last book returns there", () => {
  assert.equal(windowClose(false, 1), "destroy");
  assert.equal(windowClose(false, 2), "destroy");
  assert.equal(windowClose(true, 1), "leave");
  assert.equal(windowClose(true, 2), "destroy");
});
