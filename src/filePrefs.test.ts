import assert from "node:assert/strict";
import { test } from "node:test";
import {
  joinNovelPath,
  novelFileName,
  preferenceDirectoryLabel,
  readFilePreferences,
  saveAsChoice,
  saveChoice,
  startupAfterUnreadable,
  startupChoice,
  stepAfterOccupied,
  writeLastProject,
  writeOpenLast,
  writeSaveDirectory,
} from "./filePrefs.ts";

type Memory = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function memory(initial: Record<string, string> = {}): Memory {
  const values = { ...initial };
  return {
    getItem(key) {
      return values[key] ?? null;
    },
    setItem(key, value) {
      values[key] = value;
    },
    removeItem(key) {
      delete values[key];
    },
  };
}

test("an unset preference means Documents, and the last novel reopens", () => {
  const prefs = readFilePreferences(memory());
  assert.equal(prefs.directory, null);
  assert.equal(prefs.openLast, true);
  assert.equal(prefs.lastProject, null);
  assert.equal(preferenceDirectoryLabel(prefs.directory), "Documents");
  assert.deepEqual(startupChoice(prefs, true), { kind: "working-copy" });
  assert.deepEqual(startupChoice(prefs, false), { kind: "landing" });
});

test("a blank or missing folder is Documents, and only an explicit false skips the last novel", () => {
  const blank = readFilePreferences(
    memory({
      "manuscriptic-save-directory": "   ",
      "manuscriptic-open-last": "true",
      "manuscriptic-last-project": "  ",
    }),
  );
  assert.equal(blank.directory, null);
  assert.equal(blank.openLast, true);
  assert.equal(blank.lastProject, null);
  const skipped = readFilePreferences(memory({ "manuscriptic-open-last": "false" }));
  assert.equal(skipped.openLast, false);
  assert.deepEqual(startupChoice(skipped, true), { kind: "landing" });
});

test("the chosen folder is where open and save as start", () => {
  const storage = memory();
  writeSaveDirectory(storage, "  /Users/me/Novels  ");
  const prefs = readFilePreferences(storage);
  assert.equal(prefs.directory, "/Users/me/Novels");
  assert.equal(preferenceDirectoryLabel(prefs.directory), "/Users/me/Novels");
  assert.deepEqual(saveAsChoice(prefs, "Castus"), {
    kind: "dialog",
    directory: "/Users/me/Novels",
    fileName: "Castus.json",
  });
  writeSaveDirectory(storage, null);
  assert.equal(readFilePreferences(storage).directory, null);
});

test("save writes the novel's own file, and a new novel is created in the preferred folder", () => {
  const prefs = readFilePreferences(memory({ "manuscriptic-save-directory": "/Users/me/Novels" }));
  assert.deepEqual(saveChoice(prefs, "/Users/me/Desktop/Castus.json", "Castus"), {
    kind: "write",
    path: "/Users/me/Desktop/Castus.json",
  });
  assert.deepEqual(saveChoice(prefs, null, "Untitled Novel"), {
    kind: "create",
    directory: "/Users/me/Novels",
    fileName: "Untitled Novel.json",
  });
  assert.equal(joinNovelPath("/Users/me/Novels", "Untitled Novel.json"), "/Users/me/Novels/Untitled Novel.json");
  assert.equal(joinNovelPath("C:\\Users\\me\\Documents\\", "Castus.json"), "C:\\Users\\me\\Documents\\Castus.json");
  const fresh = readFilePreferences(memory());
  const created = saveChoice(fresh, null, "Untitled Novel");
  assert.equal(created.kind, "create");
  if (created.kind === "create") {
    assert.equal(created.directory, null);
  }
});

test("a file name keeps the title and drops characters a folder cannot hold", () => {
  assert.equal(novelFileName("Castus"), "Castus.json");
  assert.equal(novelFileName("  "), "Untitled Novel.json");
  assert.equal(novelFileName("Act/One: Dawn"), "Act One Dawn.json");
});

test("a taken new file name opens save as in the same folder", () => {
  const created = saveChoice(
    readFilePreferences(memory({ "manuscriptic-save-directory": "/Users/me/Novels" })),
    null,
    "Castus",
  );
  assert.deepEqual(stepAfterOccupied(created), {
    kind: "dialog",
    directory: "/Users/me/Novels",
    fileName: "Castus.json",
  });
  const named = saveChoice(
    readFilePreferences(memory()),
    "/Users/me/Desktop/Castus.json",
    "Castus",
  );
  assert.deepEqual(stepAfterOccupied(named), named);
});

test("turning off reopen shows the landing, and a named novel wins over the working copy", () => {
  const storage = memory();
  writeOpenLast(storage, true);
  writeLastProject(storage, "/Users/me/Novels/Castus.json");
  const named = readFilePreferences(storage);
  assert.deepEqual(startupChoice(named, true), { kind: "file", path: "/Users/me/Novels/Castus.json" });
  writeOpenLast(storage, false);
  assert.deepEqual(startupChoice(readFilePreferences(storage), true), { kind: "landing" });
  writeOpenLast(storage, true);
  writeLastProject(storage, null);
  assert.deepEqual(startupChoice(readFilePreferences(storage), true), { kind: "working-copy" });
  assert.deepEqual(startupAfterUnreadable(true), { kind: "working-copy" });
  assert.deepEqual(startupAfterUnreadable(false), { kind: "landing" });
});

test("creating a novel forgets the previous file so the next start uses the working copy", () => {
  const storage = memory();
  writeLastProject(storage, "/Users/me/Novels/old.json");
  writeOpenLast(storage, true);
  writeLastProject(storage, null);
  assert.deepEqual(startupChoice(readFilePreferences(storage), true), { kind: "working-copy" });
});
