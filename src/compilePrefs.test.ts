import assert from "node:assert/strict";
import { test } from "node:test";
import {
  defaultBookCompile,
  defaultCompileFormat,
  defaultCompileIdentity,
  defaultCompilePreferences,
  resolvedCompilePreferences,
} from "./bookCompile.ts";
import { readCompileIdentity, writeCompileIdentity } from "./compilePrefs.ts";

function memory(initial: Record<string, string> = {}) {
  const values = { ...initial };
  return {
    getItem(key: string) {
      return values[key] ?? null;
    },
    setItem(key: string, value: string) {
      values[key] = value;
    },
  };
}

test("a new compile format is a double-spaced submission", () => {
  const format = defaultCompileFormat();
  assert.equal(format.font, "Times New Roman");
  assert.equal(format.points, 12);
  assert.equal(format.spacing, "double");
  assert.equal(format.indent, 0.5);
  assert.equal(format.align, "left");
  assert.equal(format.passFont, false);
  assert.equal(format.pageNumbers, "header");
  assert.equal(format.differentFirstPage, true);
  assert.deepEqual(format.margins, { top: 1, right: 1, bottom: 1, left: 1 });
  assert.equal(format.header, "{$author} / {$title} / {$page}");
  assert.equal(defaultCompilePreferences().author, "");
});

test("author information round-trips and a broken file is refused", () => {
  const storage = memory();
  writeCompileIdentity(storage, { ...defaultCompileIdentity(), author: "Ada Garth", pen: "A. Garth" });
  assert.equal(readCompileIdentity(storage).author, "Ada Garth");
  assert.equal(readCompileIdentity(storage).pen, "A. Garth");
  storage.setItem("manuscriptic-compile", "{");
  assert.throws(() => readCompileIdentity(storage), /could not be read/);
});

test("a book inherits the settings author until it keeps its own", () => {
  const book = defaultBookCompile();
  const app = { ...defaultCompileIdentity(), author: "Ada Garth" };
  const inherited = resolvedCompilePreferences({ ...book, useAppAuthor: true }, app);
  assert.equal(inherited.author, "Ada Garth");
  assert.equal(inherited.spacing, "double");
  const own = resolvedCompilePreferences(
    {
      ...book,
      useAppAuthor: false,
      author: { ...defaultCompileIdentity(), author: "A. Leigh" },
      format: { ...book.format, spacing: "single" },
    },
    app,
  );
  assert.equal(own.author, "A. Leigh");
  assert.equal(own.spacing, "single");
});
