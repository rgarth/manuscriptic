import assert from "node:assert/strict";
import { test } from "node:test";
import { scrollTopForCaret } from "./typewriter.ts";

test("typewriter scrolling keeps the caret in the middle once it gets there", () => {
  assert.equal(scrollTopForCaret(0, 40, 0, 200), 0);
  assert.equal(scrollTopForCaret(0, 100, 0, 200), 0);
  assert.equal(scrollTopForCaret(0, 400, 0, 200), 300);
  assert.equal(scrollTopForCaret(300, 40, 0, 200), 240);
  assert.equal(scrollTopForCaret(80, 100, 0, 0), 80);
});
