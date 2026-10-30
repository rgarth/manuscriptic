import assert from "node:assert/strict";
import { test } from "node:test";
import { findKey, pageKey, type KeyState } from "./menuPlan.ts";

const chord = (key: string, extra: Partial<KeyState> = {}): KeyState => ({
  key,
  ctrl: false,
  meta: false,
  shift: false,
  alt: false,
  ...extra,
});

test("the page handles the shared chords and leaves undo and book settings to the menu", () => {
  assert.deepEqual(pageKey(chord("n", { ctrl: true })), { name: "new" });
  assert.deepEqual(pageKey(chord("o", { meta: true })), { name: "open" });
  assert.deepEqual(pageKey(chord("s", { ctrl: true, shift: true })), { name: "save-as" });
  assert.deepEqual(pageKey(chord("s", { ctrl: true })), { name: "ignore" });
  assert.deepEqual(pageKey(chord(",", { ctrl: true })), { name: "settings" });
  assert.deepEqual(pageKey(chord("f", { ctrl: true, shift: true })), { name: "binder" });
  assert.equal(pageKey(chord(",", { ctrl: true, alt: true })), null);
  assert.equal(pageKey(chord(",", { ctrl: true, shift: true })), null);
  assert.equal(pageKey(chord("z", { ctrl: true })), null);
  assert.equal(pageKey(chord("y", { ctrl: true })), null);
  assert.equal(pageKey(chord("n", {})), null);
});

test("find chords match the menu, and alt f is replace", () => {
  assert.equal(findKey(chord("f", { ctrl: true })), "find");
  assert.equal(findKey(chord("f", { ctrl: true, alt: true })), "replace");
  assert.equal(findKey(chord("g", { ctrl: true })), "find-next");
  assert.equal(findKey(chord("g", { meta: true, shift: true })), "find-previous");
  assert.equal(findKey(chord("f", { ctrl: true, shift: true })), null);
});
