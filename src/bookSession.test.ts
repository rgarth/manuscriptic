import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookFromArchive,
  filesToSave,
  newBook,
  recordedSnapshot,
  restoredBook,
  takenNameMessage,
} from "./bookSession.ts";
import { menuCommand } from "./menuCommand.ts";
import { renameProject } from "./model/project.ts";

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
  assert.equal(takenNameMessage("already-exists"), "A book with that name is already in this folder.");
  assert.equal(takenNameMessage(new Error("disk full")), null);
});

test("a menu command is one of the known actions", () => {
  assert.deepEqual(menuCommand({ name: "save-as" }), { name: "save-as" });
  assert.deepEqual(menuCommand({ name: "format", command: "bold" }), { name: "format", command: "bold" });
  assert.equal(menuCommand({ name: "format", command: "nope" }), null);
  assert.equal(menuCommand({ name: "explode" }), null);
});
