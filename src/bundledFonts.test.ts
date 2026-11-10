import assert from "node:assert/strict";
import { test } from "node:test";
import { cssGenericFor, isBundledFontFamily } from "./bundledFonts.ts";

test("bundled Liberation families are recognised", () => {
  assert.equal(isBundledFontFamily("Liberation Serif"), true);
  assert.equal(isBundledFontFamily("Liberation Sans"), true);
  assert.equal(isBundledFontFamily("Liberation Mono"), true);
  assert.equal(isBundledFontFamily("Times New Roman"), false);
});

test("css generics follow the Liberation class", () => {
  assert.equal(cssGenericFor("Liberation Serif"), "serif");
  assert.equal(cssGenericFor("Liberation Sans"), "sans-serif");
  assert.equal(cssGenericFor("Liberation Mono"), "monospace");
});
