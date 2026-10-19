import assert from "node:assert/strict";
import { test } from "node:test";
import { readFilePreferences, saveAsChoice, saveChoice } from "./filePrefs.ts";
import { createNovelProject } from "./model/project.ts";
import { novelFromText, openAtStartup, placeNovel, type NovelFiles } from "./novelSession.ts";

const novel = JSON.stringify(createNovelProject());

function files(write: NovelFiles["write"], pickSave: NovelFiles["pickSave"] = async () => null): NovelFiles {
  return {
    directory: async (preferred) => preferred ?? "/Users/me/Documents",
    pickSave,
    write,
  };
}

test("startup opens the last file, and an unreadable file falls back to the working copy", async () => {
  const prefs = readFilePreferences({
    getItem: (key) => (key === "manuscriptic-last-project" ? "/Users/me/Novels/Castus.json" : null),
    setItem: () => undefined,
    removeItem: () => undefined,
  });
  const opened = await openAtStartup(prefs, novel, async () => novel);
  assert.equal(opened.path, "/Users/me/Novels/Castus.json");
  assert.equal(opened.notice, null);
  assert.equal(opened.project?.title, "Untitled Novel");

  const recovered = await openAtStartup(prefs, novel, async () => {
    throw new Error("missing");
  });
  assert.equal(recovered.path, null);
  assert.equal(recovered.notice, "missing");
  assert.ok(recovered.project);

  const landing = await openAtStartup(prefs, "not json", async () => {
    throw new Error("missing");
  });
  assert.equal(landing.project, null);
  assert.equal(landing.notice, "missing");
});

test("a new novel is created once, and a taken name asks where to save", async () => {
  const prefs = readFilePreferences({
    getItem: () => "/Users/me/Novels",
    setItem: () => undefined,
    removeItem: () => undefined,
  });
  const writes: Array<{ path: string; overwrite: boolean }> = [];
  const placed = await placeNovel(
    saveChoice(prefs, null, "Castus"),
    novel,
    files(async (path, _contents, overwrite) => {
      writes.push({ path, overwrite });
      if (!overwrite) {
        throw "already-exists";
      }
    }, async () => "/Users/me/Novels/Castus (2).json"),
  );
  assert.equal(placed, "/Users/me/Novels/Castus (2).json");
  assert.deepEqual(writes, [
    { path: "/Users/me/Novels/Castus.json", overwrite: false },
    { path: "/Users/me/Novels/Castus (2).json", overwrite: true },
  ]);
});

test("save as writes the chosen file, including one that already exists", async () => {
  const prefs = readFilePreferences({
    getItem: () => "/Users/me/Novels",
    setItem: () => undefined,
    removeItem: () => undefined,
  });
  const writes: boolean[] = [];
  const placed = await placeNovel(
    saveAsChoice(prefs, "Castus"),
    novel,
    files(async (_path, _contents, overwrite) => {
      writes.push(overwrite);
    }, async () => "/Users/me/Novels/Castus.json"),
  );
  assert.equal(placed, "/Users/me/Novels/Castus.json");
  assert.deepEqual(writes, [true]);
  assert.equal(novelFromText(novel).title, "Untitled Novel");
});
