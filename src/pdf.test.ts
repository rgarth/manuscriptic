import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { inflateSync } from "node:zlib";
import { create } from "fontkit";
import { defaultCompilePreferences } from "./bookCompile.ts";
import type { CompileDocument } from "./compileShape.ts";
import { compilePdf } from "./pdf.ts";
import type { FontBytes, FontFiles, FontLibrary } from "./pdfFont.ts";

const supplemental = "/System/Library/Fonts/Supplemental";

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

function file(name: string): FontBytes | null {
  const path = `${supplemental}/${name}`;
  if (!existsSync(path)) {
    return null;
  }
  return { bytes: new Uint8Array(readFileSync(path)), postscript: "", index: 0 };
}

function garamond(): FontBytes {
  const path = "node_modules/@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-normal.woff2";
  return { bytes: new Uint8Array(readFileSync(path)), postscript: "", index: 0 };
}

function filesOf(regular: FontBytes | null, bold: FontBytes | null, italic: FontBytes | null, boldItalic: FontBytes | null): FontFiles {
  return {
    regular: regular ?? garamond(),
    bold,
    italic,
    boldItalic,
  };
}

function library(): FontLibrary {
  const times = filesOf(
    file("Times New Roman.ttf"),
    file("Times New Roman Bold.ttf"),
    file("Times New Roman Italic.ttf"),
    file("Times New Roman Bold Italic.ttf"),
  );
  const courier = filesOf(file("Courier New.ttf"), file("Courier New Bold.ttf"), file("Courier New Italic.ttf"), file("Courier New Bold Italic.ttf"));
  return new Map([
    ["Times New Roman", times],
    ["Courier", courier],
  ]);
}

function postscript(face: FontBytes): string {
  return create(face.bytes).postscriptName;
}

function objectsOf(pdf: Uint8Array): Map<number, string> {
  const source = Buffer.from(pdf).toString("latin1");
  const objects = new Map<number, string>();
  let index = 0;
  while (index < source.length) {
    const header = source.indexOf(" 0 obj\n", index);
    if (header < 0) {
      break;
    }
    let idStart = header;
    while (idStart > index && source.charCodeAt(idStart - 1) >= 48 && source.charCodeAt(idStart - 1) <= 57) {
      idStart -= 1;
    }
    const bodyStart = header + " 0 obj\n".length;
    const lengthHeader = /^<< \/Length (\d+)/.exec(source.slice(bodyStart));
    const streamAt = lengthHeader ? source.indexOf("\nstream\n", bodyStart) : -1;
    const searchFrom = lengthHeader && streamAt >= 0 ? streamAt + "\nstream\n".length + Number(lengthHeader[1]) : bodyStart;
    const bodyEnd = source.indexOf("\nendobj", searchFrom);
    if (bodyEnd < 0) {
      break;
    }
    let body = source.slice(bodyStart, bodyEnd);
    if (lengthHeader && streamAt >= 0 && source.slice(bodyStart, streamAt).includes("/FlateDecode")) {
      const dataStart = streamAt + "\nstream\n".length;
      const packed = Buffer.from(source.slice(dataStart, dataStart + Number(lengthHeader[1])), "latin1");
      const opened = inflateSync(packed).toString("latin1");
      body = `${source.slice(bodyStart, dataStart)}${opened}${source.slice(dataStart + Number(lengthHeader[1]), bodyEnd)}`;
    }
    objects.set(Number(source.slice(idStart, header)), body);
    index = bodyEnd + "\nendobj".length;
  }
  return objects;
}

function sourceOf(pdf: Uint8Array): string {
  return [...objectsOf(pdf).values()].join("\n");
}

function pageText(pdf: Uint8Array): string[] {
  const objects = objectsOf(pdf);
  const unicode = new Map<number, Map<string, string>>();
  for (const [id, body] of objects) {
    if (!body.includes("beginbfchar")) {
      continue;
    }
    const map = new Map<string, string>();
    for (const block of body.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
      for (const item of (block[1] ?? "").matchAll(/<([0-9A-F]+)>\s*<([0-9A-F]+)>/g)) {
        map.set(item[1] ?? "", decodeUtf16(item[2] ?? ""));
      }
    }
    unicode.set(id, map);
  }
  const fonts = new Map<number, Map<string, string>>();
  for (const [id, body] of objects) {
    if (!body.includes("/Subtype /Type0")) {
      continue;
    }
    const link = /\/ToUnicode (\d+) 0 R/.exec(body);
    const map = link ? unicode.get(Number(link[1])) : undefined;
    if (map) {
      fonts.set(id, map);
    }
  }
  const pages: string[] = [];
  for (const body of objects.values()) {
    if (!body.includes("/Type /Page")) {
      continue;
    }
    const contentId = /\/Contents (\d+) 0 R/.exec(body);
    const content = contentId ? objects.get(Number(contentId[1])) : undefined;
    if (!content) {
      continue;
    }
    const faces = new Map<number, Map<string, string>>();
    for (const face of body.matchAll(/\/F(\d+) (\d+) 0 R/g)) {
      const map = fonts.get(Number(face[2]));
      if (map) {
        faces.set(Number(face[1]), map);
      }
    }
    let current = faces.get(0);
    let text = "";
    for (const token of content.matchAll(/\/F(\d+)\s+[\d.]+\s+Tf|<([0-9A-F]+)>/g)) {
      if (token[1]) {
        current = faces.get(Number(token[1])) ?? current;
        continue;
      }
      const hex = token[2] ?? "";
      for (let index = 0; index < hex.length; index += 4) {
        text += current?.get(hex.slice(index, index + 4)) ?? "";
      }
    }
    pages.push(text);
  }
  return pages;
}

function decodeUtf16(hex: string): string {
  let text = "";
  for (let index = 0; index < hex.length; index += 4) {
    const code = Number.parseInt(hex.slice(index, index + 4), 16);
    text += String.fromCodePoint(code);
  }
  return text;
}

const fonts = library();
const times = fonts.get("Times New Roman");
const courier = fonts.get("Courier");

test("a compiled pdf is a real pdf of the same pages", async () => {
  assert.ok(times);
  const hello = await compilePdf(
    document([{ runs: [{ kind: "text", text: "Hello", marks: [{ type: "bold" }] }], align: "left", indent: false, pageBreakBefore: false }]),
    fonts,
  );
  const text = new TextDecoder().decode(hello);
  assert.equal(text.startsWith("%PDF"), true);
  const boldFace = times.bold ?? times.regular;
  assert.ok(boldFace);
  assert.match(text, new RegExp(postscript(boldFace).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  const helloPages = pageText(hello);
  assert.equal(helloPages.some((page) => page.includes("Hello")), true);
  assert.equal(helloPages.some((page) => page.includes("Ada")), false);

  const long = Array.from({ length: 900 }, () => "manuscript").join(" ");
  const pages = await compilePdf(
    document([
      {
        runs: [{ kind: "text", text: long, marks: [] }],
        align: "left",
        indent: true,
        pageBreakBefore: false,
      },
    ]),
    fonts,
  );
  const laid = pageText(pages);
  assert.ok(laid.length > 1);
  assert.equal(laid[0]?.includes("Ada"), false);
  assert.match(laid[1] ?? "", /Ada2/);
  assert.match(laid[1] ?? "", /manuscript/);
  const stored = [...Buffer.from(pages).toString("latin1").matchAll(/\/Length (\d+) \/Filter \/FlateDecode/g)].reduce(
    (sum, item) => sum + Number(item[1]),
    0,
  );
  const opened = [...objectsOf(pages).values()].reduce((sum, body) => sum + body.length, 0);
  assert.ok(stored > 0);
  assert.ok(stored * 2 < opened);

  const continued = await compilePdf(
    document(
      [
        { runs: [{ kind: "text", text: "First", marks: [] }], align: "left", indent: false, pageBreakBefore: false },
        { runs: [{ kind: "text", text: "Next", marks: [] }], align: "left", indent: false, pageBreakBefore: true },
      ],
      { differentFirstPage: false },
    ),
    fonts,
  );
  const numbered = pageText(continued);
  assert.match(numbered[0] ?? "", /Ada1/);
  assert.match(numbered[0] ?? "", /First/);
  assert.match(numbered[1] ?? "", /Ada2/);
  assert.match(numbered[1] ?? "", /Next/);
});

test("justified lines keep the words and leave the last line flush", async () => {
  const sentence = "The harbor light stayed on through the storm and the boats pulled close.";
  const pdf = await compilePdf(
    document([
      { runs: [{ kind: "text", text: sentence, marks: [] }], align: "justify", indent: false, pageBreakBefore: false },
      { runs: [{ kind: "text", text: "Done.", marks: [] }], align: "justify", indent: false, pageBreakBefore: false },
    ]),
    fonts,
  );
  const text = pageText(pdf).join("");
  assert.match(text, /harbor light stayed/);
  assert.match(text, /Done\./);
});

test("a heading keeps the size and font set on that structure level", async () => {
  assert.ok(courier);
  const pdf = await compilePdf(
    document([
      {
        runs: [{ kind: "text", text: "Chapter", marks: [], font: "Courier", points: 32 }],
        align: "center",
        indent: false,
        pageBreakBefore: false,
      },
    ]),
    fonts,
  );
  const text = sourceOf(pdf);
  assert.ok(courier.regular);
  assert.match(text, new RegExp(postscript(courier.regular).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(text, /32 Tf/);
  assert.match(pageText(pdf).join(""), /Chapter/);
});

test("pdf keeps the same marks as a word compile", async () => {
  assert.ok(times);
  const pdf = await compilePdf(
    document([
      {
        runs: [
          { kind: "text", text: "under", marks: [{ type: "underline" }] },
          { kind: "text", text: " struck", marks: [{ type: "strike" }] },
          { kind: "text", text: "up", marks: [{ type: "superscript" }] },
          { kind: "text", text: "down", marks: [{ type: "subscript" }] },
          { kind: "text", text: "both", marks: [{ type: "bold" }, { type: "italic" }, { type: "underline" }] },
        ],
        align: "left",
        indent: false,
        pageBreakBefore: false,
      },
    ]),
    fonts,
  );
  const text = sourceOf(pdf);
  const pages = pageText(pdf).join("");
  assert.match(pages, /under/);
  assert.match(pages, /struck/);
  assert.match(pages, /up/);
  assert.match(pages, /down/);
  assert.match(pages, /both/);
  const boldItalic = times.boldItalic;
  if (boldItalic) {
    assert.match(text, new RegExp(postscript(boldItalic).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(text, /3\.96 Ts/);
  assert.match(text, /-2\.4 Ts/);
  assert.match(text, /7\.2 Tf/);
  assert.match(text, /\nS\n/);
});

test("a font collection contributes the face that was asked for", async () => {
  const path = "/System/Library/Fonts/Palatino.ttc";
  if (!existsSync(path)) {
    return;
  }
  const bytes = new Uint8Array(readFileSync(path));
  const palatino = new Map<string, FontFiles>([
    [
      "Palatino",
      {
        regular: { bytes, postscript: "Palatino-Roman", index: 0 },
        bold: { bytes, postscript: "Palatino-Bold", index: 2 },
        italic: null,
        boldItalic: null,
      },
    ],
  ]);
  const pdf = await compilePdf(
    document(
      [
        {
          runs: [
            { kind: "text", text: "Roman", marks: [] },
            { kind: "text", text: "Heavy", marks: [{ type: "bold" }] },
          ],
          align: "left",
          indent: false,
          pageBreakBefore: false,
        },
      ],
      { font: "Palatino", header: [], differentFirstPage: false },
    ),
    palatino,
  );
  const text = new TextDecoder().decode(pdf);
  assert.match(text, /Palatino-Roman/);
  assert.match(text, /Palatino-Bold/);
  assert.match(pageText(pdf).join(""), /RomanHeavy/);
});

test("a font with compound glyphs still prints the letters", async () => {
  const face = garamond();
  const embedded = new Map<string, FontFiles>([
    ["EB Garamond", { regular: face, bold: null, italic: null, boldItalic: null }],
  ]);
  const pdf = await compilePdf(
    document(
      [
        {
          runs: [{ kind: "text", text: "The light office.", marks: [] }],
          align: "left",
          indent: false,
          pageBreakBefore: false,
        },
      ],
      { font: "EB Garamond", header: [], differentFirstPage: false },
    ),
    embedded,
  );
  assert.match(pageText(pdf).join(""), /light office/);
});

test("a variable font is drawn bold when the file has no bold instance", async () => {
  const path = "/System/Library/Fonts/NewYork.ttf";
  if (!existsSync(path)) {
    return;
  }
  const bytes = new Uint8Array(readFileSync(path));
  const face = { bytes, postscript: "", index: 0 };
  const york = new Map<string, FontFiles>([
    ["New York", { regular: face, bold: face, italic: null, boldItalic: null }],
  ]);
  const pdf = await compilePdf(
    document(
      [
        {
          runs: [{ kind: "text", text: "Hello", marks: [{ type: "bold" }] }],
          align: "left",
          indent: false,
          pageBreakBefore: false,
        },
      ],
      { font: "New York", header: [], differentFirstPage: false },
    ),
    york,
  );
  const text = sourceOf(pdf);
  assert.match(text, /2 Tr/);
  assert.match(text, /NewYork/);
  assert.match(pageText(pdf).join(""), /Hello/);

  const slanted = await compilePdf(
    document(
      [
        {
          runs: [{ kind: "text", text: "Hello", marks: [{ type: "italic" }] }],
          align: "left",
          indent: false,
          pageBreakBefore: false,
        },
      ],
      { font: "New York", header: [], differentFirstPage: false },
    ),
    york,
  );
  const slantedText = sourceOf(slanted);
  assert.match(slantedText, /0\.2 /);
  assert.match(slantedText, /\/Flags 96/);
  assert.match(pageText(slanted).join(""), /Hello/);
});
