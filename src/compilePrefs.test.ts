import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultCompilePreferences,
  readCompilePreferences,
  writeCompilePreferences,
} from "./compilePrefs.ts";

function memory(initial: Record<string, string> = {}) {
  const values = { ...initial };
  return {
    getItem(key: string) {
      return values[key] ?? null;
    },
    setItem(key: string, value: string) {
      values[key] = value;
    },
  };
}

test("compile settings start as a double-spaced submission", () => {
  const prefs = readCompilePreferences(memory());
  assert.equal(prefs.font, "Times New Roman");
  assert.equal(prefs.points, 12);
  assert.equal(prefs.spacing, "double");
  assert.equal(prefs.indent, 0.5);
  assert.equal(prefs.align, "left");
  assert.equal(prefs.passFont, false);
  assert.equal(prefs.pageNumbers, "header");
  assert.equal(prefs.differentFirstPage, true);
  assert.deepEqual(prefs.margins, { top: 1, right: 1, bottom: 1, left: 1 });
  assert.equal(prefs.header, "{$author} / {$title} / {$page}");
  assert.equal(prefs.author, "");
});

test("compile settings round-trip and a broken file is refused", () => {
  const storage = memory();
  const next = { ...defaultCompilePreferences(), author: "Ada Garth", pen: "A. Garth", spacing: "single" as const };
  writeCompilePreferences(storage, next);
  assert.equal(readCompilePreferences(storage).author, "Ada Garth");
  assert.equal(readCompilePreferences(storage).pen, "A. Garth");
  assert.equal(readCompilePreferences(storage).spacing, "single");
  storage.setItem("manuscriptic-compile", "{");
  assert.throws(() => readCompilePreferences(storage), /could not be read/);
});
