import assert from "node:assert/strict";
import { test } from "node:test";
import { rtfToDoc } from "./rtf.ts";

test("scrivener text keeps paragraphs, marks, and a unicode character", () => {
  const doc = rtfToDoc(
    "{\\rtf1\\ansi\\uc0{\\fonttbl{\\f0 Times New Roman;}}\\b Bold\\b0  and \\i italic\\i0\\par\nSecond\\par}",
  );
  assert.deepEqual(doc, {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Bold", marks: [{ type: "bold" }] },
          { type: "text", text: " and " },
          { type: "text", text: "italic", marks: [{ type: "italic" }] },
        ],
      },
      { type: "paragraph", content: [{ type: "text", text: "Second" }] },
    ],
  });
});

test("a unicode character does not swallow the letter after it when there is no fallback", () => {
  const doc = rtfToDoc("{\\rtf1\\ansi\\uc0 Say \\u8212  more}");
  assert.deepEqual(doc.content, [
    { type: "paragraph", content: [{ type: "text", text: "Say — more" }] },
  ]);
});

test("one fallback character after a unicode escape is discarded", () => {
  const doc = rtfToDoc("{\\rtf1\\ansi\\uc1 Say \\u8212? more}");
  assert.deepEqual(doc.content, [
    { type: "paragraph", content: [{ type: "text", text: "Say — more" }] },
  ]);
});

test("windows quotes stay curly and the font table stays out of the text", () => {
  const doc = rtfToDoc("{\\rtf1\\ansi\\uc0{\\fonttbl{\\f0 Times;}}\\'93Hello\\'94}");
  assert.deepEqual(doc.content, [
    { type: "paragraph", content: [{ type: "text", text: "“Hello”" }] },
  ]);
});

test("a backslash at the end of a line is a new paragraph", () => {
  const doc = rtfToDoc("{\\rtf1\\ansi\\uc0 Remy stood in the room again.\\\nIt was already full.\\\r\nBoxes were stacked.}");
  assert.deepEqual(
    doc.content.map((block) => (block.type === "paragraph" ? block.content?.[0] : block)),
    [
      { type: "text", text: "Remy stood in the room again." },
      { type: "text", text: "It was already full." },
      { type: "text", text: "Boxes were stacked." },
    ],
  );
});

test("an empty scrivener document is an empty page", () => {
  assert.deepEqual(rtfToDoc("{\\rtf1\\ansi\\uc0 \\par}"), {
    type: "doc",
    content: [{ type: "paragraph" }],
  });
});
