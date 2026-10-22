import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { bookFromFiles, filesForBook } from "./bookArchive.ts";
import { defaultCompilePreferences, type CompilePreferences } from "./bookCompile.ts";
import { buildCompile } from "./compileShape.ts";
import { compileRows, initialCompileTicks, rememberCompile, toggleCompileRow } from "./compileTicks.ts";
import { compiledFile, compileDocx } from "./docx.ts";
import type { EditorDoc } from "./model/editorDoc.ts";
import {
  createNovelProject,
  documentNode,
  findNode,
  folderNode,
  setBookCompile,
  setDocumentContent,
  setPageLayout,
  type ProjectFile,
} from "./model/project.ts";

function scene(): EditorDoc {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "world", marks: [{ type: "bold" }] },
        ],
      },
    ],
  };
}

function prose(text: string): EditorDoc {
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
}

function unzip(bytes: Uint8Array): { document: string; header: string; firstHeader: string; core: string } {
  const dir = mkdtempSync(join(tmpdir(), "manuscriptic-docx-"));
  try {
    const file = join(dir, "book.docx");
    writeFileSync(file, bytes);
    const out = join(dir, "out");
    execFileSync("unzip", ["-q", file, "-d", out]);
    const read = (path: string) => readFileSync(join(out, path), "utf8");
    return {
      document: read("word/document.xml"),
      header: read("word/header1.xml"),
      firstHeader: read("word/header2.xml"),
      core: read("docProps/core.xml"),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function visibleText(xml: string): string[] {
  return [...xml.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map((match) => match[1] ?? "");
}

function earlier(xml: string, first: string, second: string) {
  const text = visibleText(xml).join("");
  const start = text.indexOf(first);
  const later = text.indexOf(second, start + first.length);
  assert.equal(start >= 0, true, first);
  assert.equal(later > start, true, second);
}

function paragraphWith(document: string, text: string): string {
  const found = document.split("<w:p>").find((chunk) => chunk.includes(`>${text}</w:t>`));
  assert.ok(found, text);
  return found ?? "";
}

test("a docx carries the paragraph, the mark, the margin, and the header", () => {
  const opening = documentNode("Opening", "scene", scene());
  const chapter = folderNode("A Silver Tide", [opening]);
  const project = createNovelProject();
  const book = {
    ...project,
    title: "Bone Road",
    manuscript: { ...project.manuscript, children: [chapter] },
  };
  const included = new Set([book.manuscript.id, chapter.id, opening.id]);
  const compiled = buildCompile(
    book,
    included,
    { ...defaultCompilePreferences(), author: "Ada Garth" },
    2026,
  );
  const { document, header, firstHeader, core } = unzip(compileDocx(compiled));
  assert.match(document, /Hello /);
  assert.match(document, /<w:b\/>/);
  assert.match(document, /world/);
  assert.match(document, /A Silver Tide/);
  assert.match(document, /w:left="1440"/);
  assert.match(document, /w:top="1440"/);
  assert.match(document, /w:line="480"/);
  assert.match(header, /Ada Garth/);
  assert.match(header, /Bone Road/);
  assert.match(header, /PAGE/);
  assert.match(core, /<dc:title>Bone Road<\/dc:title>/);
  assert.match(core, /<dc:creator>Ada Garth<\/dc:creator>/);
  assert.equal(firstHeader.includes("PAGE"), false);
});

test("a saved book compiles the ticked pages in order", () => {
  const once = documentNode("Before", "scene", prose("Once upon"));
  const prologue = folderNode("Prologue", [once]);
  const opening = documentNode("Opening", "scene", scene());
  const later = documentNode("Later", "scene", prose("After the break"));
  const chapter = folderNode("A Silver Tide", [opening, later]);
  const part = folderNode("The Sea", [chapter]);
  const discarded = documentNode("Discarded", "scene", prose("Discarded words"));
  const old = folderNode("Old Draft", [discarded]);
  let book = createNovelProject();
  book = {
    ...book,
    title: "Bone Road",
    manuscript: { ...book.manuscript, children: [prologue, part, old] },
  };
  book = setBookCompile(book, {
    ...book.compile,
    levels: [
      { include: false, name: "", heading: "none" },
      { include: true, name: "Chapter", heading: "number" },
      { include: true, name: "Part", heading: "number" },
    ],
    sceneBreak: "hash",
    titleOnly: [prologue.id],
  });
  book = setDocumentContent(book, rowId(book, "Acknowledgements"), prose("With thanks"));
  book = setDocumentContent(book, rowId(book, "Synopsis"), prose("The whole plot."));
  const ticks = toggleCompileRow(book, initialCompileTicks(book), old.id);
  const remembered = rememberCompile(book, ticks);
  const loaded = bookFromFiles(filesForBook(remembered));
  assert.ok(loaded);
  if (!loaded) {
    return;
  }
  assert.equal(loaded.compile.levels[1]?.heading, "number");
  assert.equal(loaded.compile.levels[2]?.heading, "number");
  assert.deepEqual(loaded.compile.titleOnly, [prologue.id]);
  const included = initialCompileTicks(loaded);
  assert.equal(included.has(rowId(loaded, "Old Draft")), false);
  assert.equal(included.has(rowId(loaded, "A Silver Tide")), true);
  assert.equal(included.has(rowId(loaded, "Synopsis")), true);
  const compiled = buildCompile(loaded, included, submission(), 2026);
  assert.deepEqual(compiled.missing, ["pen"]);
  const { document, header, firstHeader, core } = unzip(compileDocx(compiled));
  const text = visibleText(document);
  const flat = text.join("");
  for (const line of [
    "Ada Garth",
    "1 Ridge",
    "Town",
    "Bone Road",
    "by {$pen}",
    "7 words",
    "Copyright 2026 Ada Garth",
    "Prologue",
    "Once upon",
    "Part 1",
    "Chapter 1",
    "Hello ",
    "world",
    "#",
    "After the break",
    "With thanks",
    "The whole plot.",
    "Bone Road, 7 words.",
  ]) {
    assert.equal(flat.includes(line), true, line);
  }
  earlier(document, "by {$pen}", "Copyright 2026 Ada Garth");
  earlier(document, "Copyright 2026 Ada Garth", "Prologue");
  earlier(document, "Once upon", "Part 1");
  earlier(document, "Part 1", "Chapter 1");
  earlier(document, "Chapter 1", "#");
  earlier(document, "#", "After the break");
  earlier(document, "After the break", "With thanks");
  earlier(document, "With thanks", "The whole plot.");
  earlier(document, "The whole plot.", "Bone Road, 7 words.");
  assert.equal(flat.includes("Discarded words"), false);
  assert.equal(flat.includes("A Silver Tide"), false);
  assert.equal(flat.includes("The Sea"), false);
  assert.equal(flat.includes("Chapter 2"), false);
  const partHeading = paragraphWith(document, "Part 1");
  const chapterHeading = paragraphWith(document, "Chapter 1");
  assert.equal(partHeading.includes("pageBreakBefore"), false);
  assert.equal(chapterHeading.includes("pageBreakBefore"), false);
  assert.match(partHeading, /w:jc w:val="center"/);
  assert.equal(partHeading.includes("w:ind"), false);
  assert.match(paragraphWith(document, "Once upon"), /w:firstLine="720"/);
  assert.equal(paragraphWith(document, "Ada Garth").includes("w:ind"), false);
  assert.match(paragraphWith(document, "world"), /<w:b\/>/);
  assert.match(paragraphWith(document, "#"), /w:jc w:val="center"/);
  assert.match(document, /w:left="1440"/);
  assert.match(document, /w:line="480"/);
  assert.match(header, /Ada Garth/);
  assert.match(header, /Bone Road/);
  assert.match(header, /PAGE/);
  assert.equal(firstHeader.includes("PAGE"), false);
  assert.match(core, /<dc:title>Bone Road<\/dc:title>/);
  const synopsisOnly = buildCompile(loaded, new Set([rowId(loaded, "Synopsis")]), submission(), 2026);
  const synopsisFile = unzip(compileDocx(synopsisOnly));
  const synopsisText = visibleText(synopsisFile.document);
  assert.deepEqual(synopsisText, ["The whole plot."]);
  const oldNode = findNode(loaded, rowId(loaded, "Old Draft"));
  assert.equal(oldNode?.node.includeInCompile, false);
});

test("a bullet list and the book's font pass through", () => {
  const listed = documentNode("Opening", "scene", {
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "item" }] }],
          },
        ],
      },
    ],
  });
  const chapter = folderNode("Tide", [listed]);
  let book = createNovelProject();
  book = setPageLayout(
    { ...book, title: "Bone Road", manuscript: { ...book.manuscript, children: [chapter] } },
    { font: "Courier", points: 14, align: "left" },
  );
  const included = new Set([book.manuscript.id, chapter.id, listed.id]);
  const compiled = buildCompile(book, included, { ...submission(), passFont: true }, 2026);
  const { document } = unzip(compileDocx(compiled));
  assert.equal(visibleText(document).includes("• "), true);
  assert.equal(visibleText(document).includes("item"), true);
  assert.match(document, /w:ascii="Courier"/);
  assert.match(document, /w:sz w:val="28"/);
});

test("an empty selection and a chapter with no scenes write nothing", () => {
  const scene = documentNode("Opening", "scene", prose("Hello"));
  const chapter = folderNode("Tide", [scene]);
  const project = createNovelProject();
  const book = { ...project, manuscript: { ...project.manuscript, children: [chapter] } };
  assert.equal(compiledFile(book, new Set(), submission(), 2026).kind, "empty");
  assert.equal(compiledFile(book, new Set([book.manuscript.id, chapter.id]), submission(), 2026).kind, "empty");
  const titlePage = book.publishing.children.find((child) => child.kind === "folder" && child.matter === "front");
  assert.equal(titlePage?.kind, "folder");
  const page = titlePage?.kind === "folder" ? titlePage.children.find((child) => child.title === "Title page") : undefined;
  assert.equal(page?.kind, "document");
  if (page?.kind !== "document") {
    return;
  }
  const file = compiledFile(book, new Set([page.id]), submission(), 2026);
  assert.equal(file.kind, "docx");
  if (file.kind === "docx") {
    assert.deepEqual(file.missing, ["pen"]);
    assert.match(unzip(file.bytes).document, /Untitled Novel/);
  }
});

function submission(): CompilePreferences {
  return {
    ...defaultCompilePreferences(),
    author: "Ada Garth",
    address: "1 Ridge\nTown",
    phone: "555",
    email: "ada@example.com",
  };
}

function rowId(project: ProjectFile, title: string): string {
  const listed = compileRows(project).find((row) => row.title === title);
  assert.ok(listed, title);
  return listed?.id ?? "";
}
