import assert from "node:assert/strict";
import { test } from "node:test";
import { takePendingFailures } from "./failures.ts";
import { getEditorPrefs, indentEm, lineSpacing, nextZoom, paragraphGap, paragraphIndent, setIndent, setSpacing, setTypewriter, setZoom, spacingLine, zoomPercent } from "./editorPrefs.ts";
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

test("paragraph indent and line spacing are editor views", () => {
  assert.equal(paragraphIndent(null), "first");
  assert.equal(paragraphIndent("nope"), "first");
  assert.equal(paragraphIndent("none"), "none");
  assert.equal(lineSpacing(null), "comfortable");
  assert.equal(lineSpacing("huge"), "comfortable");
  assert.equal(lineSpacing("double"), "double");
  assert.equal(indentEm("first"), "1.5em");
  assert.equal(indentEm("none"), "0");
  assert.equal(paragraphGap("first"), "0");
  assert.equal(paragraphGap("none"), "0.9em");
  assert.equal(spacingLine("single"), "1.15");
  assert.equal(spacingLine("onehalf"), "1.5");
  assert.equal(spacingLine("comfortable"), "1.7");
  assert.equal(spacingLine("double"), "2");
  const original = globalThis.localStorage;
  const saved = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        saved.set(key, value);
      },
    },
  });
  const previous = getEditorPrefs();
  const nextIndent = previous.indent === "none" ? "first" : "none";
  const nextSpacing = previous.spacing === "double" ? "single" : "double";
  try {
    setIndent(nextIndent);
    setSpacing(nextSpacing);
    assert.equal(getEditorPrefs().indent, nextIndent);
    assert.equal(getEditorPrefs().spacing, nextSpacing);
    assert.equal(saved.get("manuscriptic-paragraph-indent"), nextIndent);
    assert.equal(saved.get("manuscriptic-line-spacing"), nextSpacing);
    setIndent(previous.indent);
    setSpacing(previous.spacing);
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original });
  }
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

test("typewriter scrolling stays off until the preference is saved", () => {
  assert.equal(getEditorPrefs().typewriter, false);
  const original = globalThis.localStorage;
  const saved = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => {
        saved.set(key, value);
      },
    },
  });
  try {
    setTypewriter(true);
    assert.equal(getEditorPrefs().typewriter, true);
    assert.equal(saved.get("manuscriptic-typewriter"), "true");
    setTypewriter(false);
    assert.equal(getEditorPrefs().typewriter, false);
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
