import assert from "node:assert/strict";
import { test } from "node:test";
import { scrollTopForCaret } from "./typewriter.ts";

test("typewriter scrolling moves the page so the caret sits in the middle", () => {
  assert.equal(scrollTopForCaret(0, 400, 0, 200), 300);
  assert.equal(scrollTopForCaret(300, 40, 0, 200), 240);
  assert.equal(scrollTopForCaret(80, 100, 0, 0), 80);
});
