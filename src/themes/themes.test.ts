import assert from "node:assert/strict";
import { test } from "node:test";
import { applyTheme, collectThemes, readTheme, stylesheetAccess, type Theme } from "./collect.ts";
import { takePendingFailures } from "../failures.ts";

test("a dropped-in theme block becomes a menu entry", () => {
  const themes = collectThemes([
    { selectorText: '[data-theme="ink"]', label: "Ink", order: "2" },
    { selectorText: '[data-theme="parchment"]', label: "Parchment", order: "1" },
    { selectorText: "body", label: "", order: "" },
  ]);
  assert.deepEqual(
    themes.map((theme) => theme.id),
    ["parchment", "ink"],
  );
  assert.equal(themes[0]?.label, "Parchment");
});

test("a theme without a label uses its id", () => {
  const themes = collectThemes([
    { selectorText: '[data-theme="candle"]', label: "  ", order: "" },
  ]);
  assert.equal(themes[0]?.label, "candle");
  assert.equal(themes[0]?.order, 100);
});

test("an unknown saved theme falls back to the first theme", () => {
  const available: Theme[] = [
    { id: "parchment", label: "Parchment", order: 1 },
    { id: "ink", label: "Ink", order: 2 },
  ];
  const storage = new Map<string, string>();
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
  });
  storage.set("manuscriptic-theme", "missing");
  try {
    assert.equal(readTheme(available), "parchment");
    storage.set("manuscriptic-theme", "ink");
    assert.equal(readTheme(available), "ink");
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original });
  }
});

test("a theme stays put when it cannot be saved", () => {
  takePendingFailures();
  const element = { dataset: { theme: "parchment" } };
  const originalDocument = globalThis.document;
  const originalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: element },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      setItem: () => {
        throw new Error("quota");
      },
    },
  });
  try {
    applyTheme("ink");
    assert.equal(element.dataset.theme, "parchment");
    assert.deepEqual(takePendingFailures(), ["quota"]);
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
  }
});

test("a saved theme that cannot be read is reported and the first theme is used", () => {
  takePendingFailures();
  const available: Theme[] = [{ id: "parchment", label: "Parchment", order: 1 }];
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => {
        throw new Error("blocked");
      },
    },
  });
  try {
    assert.equal(readTheme(available), "parchment");
    assert.deepEqual(takePendingFailures(), ["blocked"]);
  } finally {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: original });
  }
});

test("only a stylesheet from this app is read for themes", () => {
  assert.equal(stylesheetAccess(null, "http://localhost:1420"), "read");
  assert.equal(stylesheetAccess("http://localhost:1420/src/themes/ink.css", "http://localhost:1420"), "read");
  assert.equal(stylesheetAccess("chrome-extension://abc/style.css", "http://localhost:1420"), "skip");
  assert.equal(stylesheetAccess("not a url", "http://localhost:1420"), "unreadable");
});
