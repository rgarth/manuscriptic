import assert from "node:assert/strict";
import { test } from "node:test";
import { collectThemes, readTheme, type Theme } from "./collect.ts";

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
