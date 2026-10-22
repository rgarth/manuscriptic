import assert from "node:assert/strict";
import { test } from "node:test";
import { applyTheme, collectThemes, readTheme, stylesheetAccess, type Theme, type ThemeRule } from "./collect.ts";
import { takePendingFailures } from "../failures.ts";

function themeRule(
  selectorText: string,
  label: string,
  order: string,
  colors: Partial<Pick<ThemeRule, "room" | "faded" | "rule" | "nib" | "scheme">> = {},
): ThemeRule {
  return {
    selectorText,
    label,
    order,
    room: "#e5dccb",
    faded: "#8a7b68",
    rule: "#e3d6c2",
    nib: "#7c3b2e",
    scheme: "light",
    ...colors,
  };
}

const midnight: Theme = {
  id: "midnight",
  label: "Midnight",
  order: 7,
  opening: {
    room: "#070e22",
    faded: "#8b9cc2",
    rule: "#24345c",
    nib: "#a8bce8",
    scheme: "dark",
  },
};

test("a dropped-in theme block becomes a theme", () => {
  const themes = collectThemes([
    themeRule('[data-theme="ink"]', "Ink", "2"),
    themeRule('[data-theme="parchment"]', "Parchment", "1"),
    themeRule("body", "", ""),
  ]);
  assert.deepEqual(
    themes.map((theme) => theme.id),
    ["parchment", "ink"],
  );
  assert.equal(themes[0]?.label, "Parchment");
});

test("a theme keeps the opening colors written on its rule", () => {
  const themes = collectThemes([
    themeRule('[data-theme="midnight"]', "Midnight", "7", {
      room: "#070e22",
      faded: "#8b9cc2",
      rule: "#24345c",
      nib: "#a8bce8",
      scheme: "dark",
    }),
    themeRule('[data-theme="ink"]', "Ink", "6", { scheme: "only dark" }),
  ]);
  assert.deepEqual(themes[1]?.opening, midnight.opening);
  assert.equal(themes[0]?.opening?.scheme, null);
  assert.equal(themes[0]?.opening?.room, "#e5dccb");
});

test("a theme with a broken opening color keeps none", () => {
  const themes = collectThemes([
    themeRule('[data-theme="ink"]', "Ink", "6", { room: "red; background: url(http://evil)" }),
  ]);
  assert.equal(themes[0]?.opening, null);
});

test("a theme without a label uses its id", () => {
  const themes = collectThemes([themeRule('[data-theme="candle"]', "  ", "")]);
  assert.equal(themes[0]?.label, "candle");
  assert.equal(themes[0]?.order, 100);
});

test("an unknown saved theme falls back to the first theme", () => {
  const available: Theme[] = [
    { id: "parchment", label: "Parchment", order: 1, opening: null },
    { id: "ink", label: "Ink", order: 2, opening: null },
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
    applyTheme("ink", [{ id: "ink", label: "Ink", order: 2, opening: null }]);
    assert.equal(element.dataset.theme, "parchment");
    assert.deepEqual(takePendingFailures(), ["quota"]);
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
  }
});

test("a saved theme that cannot be read is reported and the first theme is used", () => {
  takePendingFailures();
  const available: Theme[] = [{ id: "parchment", label: "Parchment", order: 1, opening: null }];
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

test("choosing a theme stores its opening colors", () => {
  const storage = new Map<string, string>();
  const removed: string[] = [];
  const originalDocument = globalThis.document;
  const originalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: {
        dataset: {},
        style: {
          colorScheme: "dark",
          removeProperty: (name: string) => {
            removed.push(name);
          },
        },
      },
    },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
  });
  try {
    applyTheme("midnight", [midnight]);
    assert.equal(storage.get("manuscriptic-theme"), "midnight");
    assert.deepEqual(JSON.parse(storage.get("manuscriptic-opening") ?? ""), midnight.opening);
    assert.deepEqual(removed, ["--room", "--faded", "--rule", "--nib"]);
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
  }
});

test("a theme without opening colors drops a stale opening", () => {
  const storage = new Map<string, string>([["manuscriptic-opening", "stale"]]);
  const originalDocument = globalThis.document;
  const originalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: {
        dataset: {},
        style: { colorScheme: "", removeProperty: () => undefined },
      },
    },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
  });
  try {
    applyTheme("candle", [{ id: "candle", label: "candle", order: 100, opening: null }]);
    assert.equal(storage.has("manuscriptic-opening"), false);
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
  }
});

test("an unknown theme leaves the saved opening colors alone", () => {
  const storage = new Map<string, string>([["manuscriptic-opening", "kept"]]);
  const originalDocument = globalThis.document;
  const originalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: {
        dataset: {},
        style: { colorScheme: "", removeProperty: () => undefined },
      },
    },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
  });
  try {
    applyTheme("missing", [midnight]);
    assert.equal(storage.get("manuscriptic-theme"), "missing");
    assert.equal(storage.get("manuscriptic-opening"), "kept");
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
  }
});

test("opening colors that cannot be saved are reported and cleared", () => {
  takePendingFailures();
  const storage = new Map<string, string>([["manuscriptic-opening", "stale"]]);
  const originalDocument = globalThis.document;
  const originalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: {
        dataset: {},
        style: { colorScheme: "", removeProperty: () => undefined },
      },
    },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      setItem: (key: string, value: string) => {
        if (key === "manuscriptic-opening") {
          throw new Error("quota");
        }
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    },
  });
  try {
    applyTheme("midnight", [midnight]);
    assert.equal(storage.get("manuscriptic-theme"), "midnight");
    assert.equal(storage.has("manuscriptic-opening"), false);
    assert.deepEqual(takePendingFailures(), ["quota"]);
  } finally {
    Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalStorage });
  }
});

test("only a stylesheet from this app is read for themes", () => {
  assert.equal(stylesheetAccess(null, "http://localhost:1420"), "read");
  assert.equal(stylesheetAccess("http://localhost:1420/src/themes/ink.css", "http://localhost:1420"), "read");
  assert.equal(stylesheetAccess("chrome-extension://abc/style.css", "http://localhost:1420"), "skip");
  assert.equal(stylesheetAccess("not a url", "http://localhost:1420"), "unreadable");
});
