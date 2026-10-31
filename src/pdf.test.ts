import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultCompilePreferences } from "./bookCompile.ts";
import type { CompileDocument } from "./compileShape.ts";
import { compilePdf } from "./pdf.ts";

function document(paragraphs: CompileDocument["paragraphs"], patch: Partial<CompileDocument> = {}): CompileDocument {
  const preferences = defaultCompilePreferences();
  return {
    paragraphs,
    header: [{ kind: "text", text: "Ada", marks: [] }, { kind: "page" }],
    footer: [],
    margins: preferences.margins,
    font: preferences.font,
    points: preferences.points,
    spacing: preferences.spacing,
    spaceBefore: preferences.spaceBefore,
    spaceAfter: preferences.spaceAfter,
    indentInches: preferences.indent,
    differentFirstPage: true,
    title: "Harbor",
    creator: "Manuscriptic",
    missing: [],
    hasDocument: true,
    ...patch,
  };
}

test("a compiled pdf is a real pdf of the same pages", () => {
  const hello = compilePdf(
    document([{ runs: [{ kind: "text", text: "Hello", marks: [{ type: "bold" }] }], align: "left", indent: false, pageBreakBefore: false }]),
  );
  const text = new TextDecoder().decode(hello);
  assert.equal(text.startsWith("%PDF"), true);
  assert.match(text, /\(Hello\)/);
  assert.match(text, /Times-Bold/);
  assert.equal(text.includes("(Ada1)"), false);

  const long = Array.from({ length: 900 }, () => "manuscript").join(" ");
  const pages = compilePdf(
    document([
      {
        runs: [{ kind: "text", text: long, marks: [] }],
        align: "left",
        indent: true,
        pageBreakBefore: false,
      },
    ]),
  );
  const laid = new TextDecoder().decode(pages);
  assert.ok(laid.split("/Type /Page").length > 2);
  assert.match(laid, /\(Ada2\)/);
  const continued = compilePdf(
    document(
      [
        { runs: [{ kind: "text", text: "First", marks: [] }], align: "left", indent: false, pageBreakBefore: false },
        { runs: [{ kind: "text", text: "Next", marks: [] }], align: "left", indent: false, pageBreakBefore: true },
      ],
      { differentFirstPage: false },
    ),
  );
  const numbered = new TextDecoder().decode(continued);
  assert.match(numbered, /\(Ada1\)/);
  assert.match(numbered, /\(Ada2\)/);
});

test("justified lines spread the extra space and the last line stays flush left", () => {
  const sentence = "The harbor light stayed on through the storm and the boats pulled close.";
  const pdf = compilePdf(
    document([
      { runs: [{ kind: "text", text: sentence, marks: [] }], align: "justify", indent: false, pageBreakBefore: false },
      { runs: [{ kind: "text", text: "Done.", marks: [] }], align: "justify", indent: false, pageBreakBefore: false },
    ]),
  );
  const text = new TextDecoder().decode(pdf);
  assert.match(text, /Tw/);
  assert.match(text, /\(Done\.\)/);
});
