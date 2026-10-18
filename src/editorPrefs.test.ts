import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alignmentById,
  displayPixels,
  fontFamily,
  fontName,
  nextZoom,
  pointSize,
  zoomPercent,
} from "./editorPrefs.ts";

test("the book face defaults to garamond and any other face is kept", () => {
  assert.equal(fontName(null), "EB Garamond");
  assert.equal(fontName("garamond"), "EB Garamond");
  assert.equal(fontName("baskerville"), "EB Garamond");
  assert.equal(fontName("  Comic Sans MS  "), "Comic Sans MS");
  assert.match(fontFamily("Comic Sans MS"), /^"Comic Sans MS"/);
  assert.match(fontFamily("EB Garamond"), /EB Garamond Variable/);
});

test("the page defaults to justified and can sit left, center, or right", () => {
  assert.equal(alignmentById(null), "justify");
  assert.equal(alignmentById("nope"), "justify");
  assert.equal(alignmentById("left"), "left");
  assert.equal(alignmentById("center"), "center");
  assert.equal(alignmentById("right"), "right");
});

test("a book defaults to 12 point and zoom keeps that page the size it is now", () => {
  assert.equal(pointSize(null), 12);
  assert.equal(pointSize("12"), 12);
  assert.equal(pointSize(4), 8);
  assert.equal(pointSize(400), 72);
  assert.equal(zoomPercent(null), 112.5);
  assert.equal(displayPixels(12, 112.5), 18);
  assert.equal(nextZoom(112.5, "in"), 125);
  assert.equal(nextZoom(112.5, "out"), 100);
});
