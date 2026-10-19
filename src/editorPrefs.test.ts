import assert from "node:assert/strict";
import { test } from "node:test";
import { takePendingFailures } from "./failures.ts";
import { getEditorPrefs, nextZoom, setZoom, zoomPercent } from "./editorPrefs.ts";
import { alignmentById, displayPixels, fontFamily, fontName, pointSize } from "./pageLayout.ts";

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

test("a zoom that cannot be saved stays as it was", () => {
  takePendingFailures();
  const previous = getEditorPrefs().zoom;
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    },
  });
  try {
    setZoom(previous === 150 ? 125 : 150);
    assert.equal(getEditorPrefs().zoom, previous);
    assert.deepEqual(takePendingFailures(), ["quota"]);
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original });
  }
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
