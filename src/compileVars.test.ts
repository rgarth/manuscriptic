import assert from "node:assert/strict";
import { test } from "node:test";
import { fillDocument, fillText, type CompileValues } from "./compileVars.ts";
import type { EditorDoc } from "./model/editorDoc.ts";

const values: CompileValues = {
  author: "Ada Garth",
  pen: "",
  address: "1 Ridge\nTown",
  phone: "555",
  email: "ada@example.com",
  title: "Bone Road",
  words: "80000",
  year: "2026",
};

test("a filled value replaces the token and an empty one is reported", () => {
  const filled = fillText("{$author} / {$pen}", values, "body");
  assert.deepEqual(filled.parts, [
    { kind: "text", text: "Ada Garth" },
    { kind: "text", text: " / " },
    { kind: "text", text: "{$pen}" },
  ]);
  assert.deepEqual(filled.missing, ["pen"]);
});

test("an unknown token is left in place and named", () => {
  const filled = fillText("Hello {$house}", values, "body");
  assert.deepEqual(filled.parts, [
    { kind: "text", text: "Hello " },
    { kind: "text", text: "{$house}" },
  ]);
  assert.deepEqual(filled.missing, ["house"]);
});

test("an address keeps its line breaks", () => {
  const doc: EditorDoc = {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "{$address}" }] }],
  };
  const filled = fillDocument(doc, values);
  assert.deepEqual(filled.doc.content[0], {
    type: "paragraph",
    content: [
      { type: "text", text: "1 Ridge" },
      { type: "hardBreak" },
      { type: "text", text: "Town" },
    ],
  });
  assert.deepEqual(filled.missing, []);
});

test("a page number is refused in the body and kept for the header", () => {
  const body = fillText("Page {$page}", values, "body");
  assert.deepEqual(body.parts, [
    { kind: "text", text: "Page " },
    { kind: "text", text: "{$page}" },
  ]);
  assert.deepEqual(body.missing, ["page"]);
  const header = fillText("{$author} / {$page}", values, "furniture");
  assert.deepEqual(header.parts, [
    { kind: "text", text: "Ada Garth" },
    { kind: "text", text: " / " },
    { kind: "page" },
  ]);
  assert.deepEqual(header.missing, []);
});
