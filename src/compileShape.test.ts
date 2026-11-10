import assert from "node:assert/strict";
import { test } from "node:test";
import { bookFromFiles, filesForBook } from "./bookArchive.ts";
import {
  defaultCompilePreferences,
  defaultHeading,
  defaultLevel,
  editPreset,
  type CompileLevel,
  type CompilePreferences,
  type CompilePreset,
} from "./bookCompile.ts";
import { buildCompile as compileDocument, folderRanks, type CompileParagraph } from "./compileShape.ts";
import { toggleCompileRow } from "./compileTicks.ts";
import { defaultFont } from "./pageLayout.ts";
import type { EditorDoc } from "./model/editorDoc.ts";
import {
  createNovelProject,
  seedCompileTicks,
  documentNode,
  findNode,
  folderNode,
  type BinderNode,
  renameNode,
  setBookCompile,
  setDocumentContent,
  setPageLayout,
  type ProjectFile,
} from "./model/project.ts";

function tune(project: ProjectFile, update: (preset: CompilePreset) => CompilePreset): ProjectFile {
  const preset = project.compile.presets[0];
  if (!preset) {
    throw new Error("A book has a compile.");
  }
  return setBookCompile(project, editPreset(project.compile, preset.id, update));
}

function prose(text: string): EditorDoc {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

function marked(plain: string, word: string): EditorDoc {
  const index = plain.indexOf(word);
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: plain.slice(0, index) },
          { type: "text", text: word, marks: [{ type: "bold" }] },
          { type: "text", text: plain.slice(index + word.length) },
        ],
      },
    ],
  };
}

function ids(...nodes: BinderNode[]): Set<string> {
  const found = new Set<string>();
  function visit(node: BinderNode) {
    found.add(node.id);
    if (node.kind === "folder") {
      for (const child of node.children) {
        visit(child);
      }
    }
  }
  for (const node of nodes) {
    visit(node);
  }
  return found;
}

function level(include: boolean, name: string, patch: Partial<CompileLevel> = {}): CompileLevel {
  return { ...defaultLevel(include, name), ...patch };
}

function novel(chapters: ReturnType<typeof folderNode>[]): ProjectFile {
  const project = createNovelProject();
  return seedCompileTicks({
    ...project,
    title: "Bone Road",
    manuscript: { ...project.manuscript, children: chapters },
  });
}

function pageNamed(project: ProjectFile, matter: "front" | "back", title: string): BinderNode | undefined {
  const folder = project.publishing.children.find((child) => child.kind === "folder" && child.matter === matter);
  return folder?.kind === "folder" ? folder.children.find((child) => child.title === title) : undefined;
}

function ticked(project: ProjectFile): string[] {
  const preset = project.compile.presets[0];
  if (!preset) {
    throw new Error("A book has a compile.");
  }
  return preset.included;
}

function compileOf(project: ProjectFile, included: Iterable<string>, preferences: CompilePreferences, year: number) {
  const preset = project.compile.presets[0];
  if (!preset) {
    throw new Error("A book has a compile.");
  }
  return compileDocument(project, { ...preset, included: [...included] }, preferences, year);
}

test("a manuscript font keeps each run, and an override uses one font", () => {
  const opening = documentNode("Opening", "scene", {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Hel" },
          {
            type: "text",
            text: "lo",
            marks: [{ type: "textStyle", attrs: { fontFamily: "Courier", fontSize: "32pt" } }, { type: "italic" }],
          },
        ],
      },
    ],
  });
  const chapter = folderNode("Tide", [opening]);
  const project = novel([chapter]);
  const passed = compileOf(project, new Set(ticked(project)), { ...defaultCompilePreferences(), passFont: true }, 2026);
  const hello = passed.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "Hello");
  const plain = hello?.runs.find((run) => run.kind === "text" && run.text === "Hel");
  const styled = hello?.runs.find((run) => run.kind === "text" && run.text === "lo");
  assert.equal(plain?.kind, "text");
  assert.equal(styled?.kind, "text");
  if (plain?.kind === "text" && styled?.kind === "text") {
    assert.equal(plain.font, undefined);
    assert.equal(plain.points, undefined);
    assert.equal(styled.font, "Courier");
    assert.equal(styled.points, 32);
    assert.deepEqual(styled.marks, [{ type: "italic" }]);
  }
  const overridden = compileOf(project, new Set(ticked(project)), defaultCompilePreferences(), 2026);
  const replaced = overridden.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "Hello");
  const run = replaced?.runs.find((item) => item.kind === "text" && item.text === "lo");
  assert.equal(run?.kind, "text");
  if (run?.kind === "text") {
    assert.equal(run.font, undefined);
    assert.equal(run.points, undefined);
  }
});

test("front matter keeps the editor face while the manuscript uses the override", () => {
  const opening = documentNode("Opening", "scene", {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Hel" },
          { type: "text", text: "lo", marks: [{ type: "textStyle", attrs: { fontFamily: "Courier", fontSize: "32pt" } }] },
        ],
      },
    ],
  });
  let project = setPageLayout(novel([folderNode("Tide", [opening])]), { font: "Palatino", points: 18, align: "center" });
  const titlePage = pageNamed(project, "front", "Title page");
  const thanks = pageNamed(project, "back", "Acknowledgements");
  assert.equal(titlePage?.kind, "document");
  assert.equal(thanks?.kind, "document");
  if (titlePage?.kind !== "document" || thanks?.kind !== "document") {
    return;
  }
  project = setDocumentContent(project, titlePage.id, {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Bone" },
          {
            type: "text",
            text: " Road",
            marks: [{ type: "textStyle", attrs: { fontFamily: "Courier", fontSize: "28pt" } }, { type: "italic" }],
          },
        ],
      },
    ],
  });
  project = setDocumentContent(project, thanks.id, prose("Thanks"));
  const compiled = compileOf(
    project,
    new Set([titlePage.id, thanks.id, opening.id]),
    { ...defaultCompilePreferences(), passFont: false, passFront: true, passBack: false },
    2026,
  );
  const title = compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "Bone Road");
  assert.equal(title?.align, "center");
  const bone = title?.runs.find((run) => run.kind === "text" && run.text === "Bone");
  const road = title?.runs.find((run) => run.kind === "text" && run.text === " Road");
  assert.equal(bone?.kind, "text");
  assert.equal(road?.kind, "text");
  if (bone?.kind === "text" && road?.kind === "text") {
    assert.equal(bone.font, "Palatino");
    assert.equal(bone.points, 18);
    assert.equal(road.font, "Courier");
    assert.equal(road.points, 28);
    assert.deepEqual(road.marks, [{ type: "italic" }]);
  }
  const note = compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "Thanks");
  assert.equal(note?.align, "left");
  const thanked = note?.runs.find((run) => run.kind === "text");
  assert.equal(thanked?.kind, "text");
  if (thanked?.kind === "text") {
    assert.equal(thanked.font, undefined);
  }
  const hello = compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "Hello");
  assert.equal(hello?.align, "left");
  const styled = hello?.runs.find((run) => run.kind === "text" && run.text === "lo");
  assert.equal(styled?.kind, "text");
  if (styled?.kind === "text") {
    assert.equal(styled.font, undefined);
    assert.equal(styled.points, undefined);
  }
  assert.equal(compiled.font, defaultFont);
  assert.equal(compiled.points, 12);
});

test("a passed manuscript stays unstamped while front matter fills from the editor", () => {
  const opening = documentNode("Opening", "scene", prose("Hello"));
  let project = setPageLayout(novel([folderNode("Tide", [opening])]), { font: "Palatino", points: 18, align: "center" });
  const titlePage = pageNamed(project, "front", "Title page");
  const synopsis = project.publishing.children.find((child) => child.kind === "document" && child.title === "Synopsis");
  assert.equal(titlePage?.kind, "document");
  assert.equal(synopsis?.kind, "document");
  if (titlePage?.kind !== "document" || synopsis?.kind !== "document") {
    return;
  }
  project = setDocumentContent(project, titlePage.id, {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Bone Road" }] },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "line" }] }],
          },
        ],
      },
    ],
  });
  project = setDocumentContent(project, synopsis.id, prose("Plot"));
  const compiled = compileOf(
    project,
    new Set([titlePage.id, synopsis.id, opening.id]),
    { ...defaultCompilePreferences(), passFont: true, passFront: true },
    2026,
  );
  const hello = compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "Hello");
  const plain = hello?.runs.find((run) => run.kind === "text");
  assert.equal(plain?.kind, "text");
  if (plain?.kind === "text") {
    assert.equal(plain.font, undefined);
    assert.equal(plain.points, undefined);
  }
  const title = compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "Bone Road");
  assert.equal(title?.align, "center");
  const bone = title?.runs.find((run) => run.kind === "text");
  assert.equal(bone?.kind, "text");
  if (bone?.kind === "text") {
    assert.equal(bone.font, "Palatino");
    assert.equal(bone.points, 18);
  }
  const item = compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "• line");
  const marker = item?.runs[0];
  const line = item?.runs[1];
  assert.equal(marker?.kind, "text");
  assert.equal(line?.kind, "text");
  if (marker?.kind === "text" && line?.kind === "text") {
    assert.equal(marker.font, "Palatino");
    assert.equal(marker.points, 18);
    assert.equal(line.font, "Palatino");
    assert.equal(line.points, 18);
  }
  const plot = compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "Plot");
  assert.equal(plot?.align, "center");
  const summary = plot?.runs.find((run) => run.kind === "text");
  assert.equal(summary?.kind, "text");
  if (summary?.kind === "text") {
    assert.equal(summary.font, undefined);
  }
  assert.equal(compiled.font, "Palatino");
  assert.equal(compiled.points, 18);
});

test("a paragraph keeps its alignment when the editor face is kept", () => {
  const opening = documentNode("Opening", "scene", {
    type: "doc",
    content: [
      { type: "paragraph", attrs: { align: "right" }, content: [{ type: "text", text: "Kept" }] },
      { type: "paragraph", content: [{ type: "text", text: "Inherited" }] },
    ],
  });
  let project = setPageLayout(novel([folderNode("Tide", [opening])]), { font: "Palatino", points: 18, align: "center" });
  const titlePage = pageNamed(project, "front", "Title page");
  assert.equal(titlePage?.kind, "document");
  if (titlePage?.kind !== "document") {
    return;
  }
  project = setDocumentContent(project, titlePage.id, {
    type: "doc",
    content: [
      { type: "paragraph", attrs: { align: "left" }, content: [{ type: "text", text: "Title" }] },
      { type: "paragraph", content: [{ type: "text", text: "Rest" }] },
    ],
  });
  const included = new Set([titlePage.id, opening.id]);
  const passed = compileOf(
    project,
    included,
    { ...defaultCompilePreferences(), passFont: true, passFront: true, align: "justify" },
    2026,
  );
  assert.equal(compiledAlign(passed, "Kept"), "right");
  assert.equal(compiledAlign(passed, "Inherited"), "center");
  assert.equal(compiledAlign(passed, "Title"), "left");
  assert.equal(compiledAlign(passed, "Rest"), "center");
  const overridden = compileOf(
    project,
    included,
    { ...defaultCompilePreferences(), passFont: false, passFront: false, align: "justify" },
    2026,
  );
  assert.equal(compiledAlign(overridden, "Kept"), "justify");
  assert.equal(compiledAlign(overridden, "Inherited"), "justify");
  assert.equal(compiledAlign(overridden, "Title"), "justify");
  assert.equal(compiledAlign(overridden, "Rest"), "justify");
});

function compiledAlign(compiled: { paragraphs: CompileParagraph[] }, text: string): string | undefined {
  return compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === text)?.align;
}

test("a chapter heading is the folder title and scenes keep their marks", () => {
  const opening = documentNode("Opening", "scene", marked("Hello world", "world"));
  const later = documentNode("Later", "scene", prose("After"));
  const chapter = folderNode("A Silver Tide", [opening, later]);
  const project = novel([chapter]);
  const compiled = compileOf(project, new Set(ticked(project)), { ...defaultCompilePreferences(), author: "Ada Garth" }, 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  assert.ok(text.includes("A Silver Tide"));
  assert.ok(text.includes("Hello world"));
  assert.ok(text.includes("#"));
  assert.equal(text.indexOf("Hello world") < text.indexOf("#"), true);
  assert.equal(text.indexOf("#") < text.indexOf("After"), true);
  const hello = compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "Hello world");
  assert.equal(hello?.indent, true);
  assert.equal(hello?.runs[1]?.kind, "text");
  if (hello?.runs[1]?.kind === "text") {
    assert.deepEqual(hello.runs[1].marks, [{ type: "bold" }]);
  }
  const heading = compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "A Silver Tide");
  assert.equal(heading?.align, "center");
  assert.equal(heading?.indent, false);
  assert.equal(compiled.paragraphs[0]?.pageBreakBefore, true);
  assert.equal(heading?.pageBreakBefore, false);
});

test("a title-only folder stays out of the chapter count", () => {
  const prologue = folderNode("Prologue", [documentNode("Before", "scene", prose("Once"))]);
  const first = folderNode("Tide", [documentNode("Opening", "scene", prose("Hello"))]);
  let project = novel([prologue, first]);
  project = tune(project, (preset) => ({
    ...preset,
    levels: preset.levels.map((entry, index) =>
      index === 1 ? { ...entry, name: "Chapter", title: false, number: "arabic" } : entry,
    ),
    titleOnly: [prologue.id],
  }));
  const compiled = compileOf(project, new Set(ticked(project)), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  assert.ok(text.includes("Prologue"));
  assert.ok(text.includes("Chapter 1"));
  assert.equal(text.includes("Chapter 2"), false);
});

test("an unticked chapter is left out and the next number moves up", () => {
  const old = folderNode("Old", [documentNode("Draft", "scene", prose("Discarded"))]);
  const kept = folderNode("Tide", [documentNode("Opening", "scene", prose("Hello"))]);
  let project = novel([old, kept]);
  project = tune(project, (preset) => ({
    ...preset,
    levels: preset.levels.map((entry, index) =>
      index === 1 ? { ...entry, name: "Chapter", title: false, number: "word" } : entry,
    ),
  }));
  const included = toggleCompileRow(project, new Set(ticked(project)), old.id);
  const compiled = compileOf(project, included, defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  assert.equal(text.includes("Discarded"), false);
  assert.ok(text.includes("Chapter One"));
  assert.equal(text.includes("Chapter Two"), false);
});

test("a folder-name level prints each folder title and adds nothing", () => {
  const first = folderNode("Chapter One", [documentNode("Opening", "scene", prose("Hello"))]);
  const second = folderNode("Chapter Two", [documentNode("Later", "scene", prose("Again"))]);
  let project = novel([first, second]);
  project = tune(project, (preset) => ({
    ...preset,
    levels: preset.levels.map((entry, index) =>
      index === 1 ? { ...entry, name: "Chapter", title: false, number: "folder" } : entry,
    ),
  }));
  const text = compileOf(project, new Set(ticked(project)), defaultCompilePreferences(), 2026).paragraphs.map(
    paragraphPlain,
  );
  assert.ok(text.includes("Chapter One"));
  assert.ok(text.includes("Chapter Two"));
  assert.equal(text.includes("Chapter 1"), false);
  assert.equal(text.includes("Chapter 2"), false);
});

test("a part heading shares the first chapter page", () => {
  const chapter = folderNode("Tide", [documentNode("Opening", "scene", prose("Hello"))]);
  const part = folderNode("The Sea", [chapter]);
  let project = novel([part]);
  project = tune(project, (preset) => ({
    ...preset,
    levels: [...preset.levels, level(true, "Part", { number: "arabic" })],
  }));
  const compiled = compileOf(project, new Set(ticked(project)), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  const partAt = text.indexOf("Part 1");
  const chapterAt = text.indexOf("Tide");
  assert.equal(partAt > 0, true);
  assert.equal(chapterAt, partAt + 3);
  assert.equal(compiled.paragraphs[partAt]?.pageBreakBefore, false);
  assert.equal(compiled.paragraphs[0]?.pageBreakBefore, true);
});

test("a synopsis on its own leaves the manuscript out", () => {
  const chapter = folderNode("Tide", [documentNode("Opening", "scene", prose("Hello"))]);
  let project = novel([chapter]);
  const synopsis = project.publishing.children.find((child) => child.title === "Synopsis");
  assert.equal(synopsis?.kind, "document");
  if (synopsis?.kind !== "document") {
    return;
  }
  project = setDocumentContent(project, synopsis.id, prose("The whole plot."));
  const compiled = compileOf(project, new Set([synopsis.id]), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  assert.deepEqual(text, ["The whole plot."]);
});

test("nothing ticked builds no document", () => {
  const project = novel([]);
  const compiled = compileOf(project, new Set(), defaultCompilePreferences(), 2026);
  assert.equal(compiled.hasDocument, false);
});

test("a ticked scene under an unticked chapter is still in the file", () => {
  const scene = documentNode("Opening", "scene", prose("Hello"));
  const chapter = folderNode("Tide", [scene]);
  const project = novel([chapter]);
  const compiled = compileOf(project, new Set([scene.id]), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  assert.equal(compiled.hasDocument, true);
  assert.equal(text[0], "Hello");
  assert.equal(compiled.paragraphs[0]?.pageBreakBefore, true);
  assert.equal(text.includes("Tide"), false);
});

test("a title page compiles without its folder being ticked", () => {
  const project = novel([]);
  const front = project.publishing.children.find((child) => child.kind === "folder" && child.matter === "front");
  assert.equal(front?.kind, "folder");
  const titlePage = front?.kind === "folder" ? front.children.find((child) => child.title === "Title page") : undefined;
  assert.equal(titlePage?.kind, "document");
  if (titlePage?.kind !== "document") {
    return;
  }
  const compiled = compileOf(project, new Set([titlePage.id]), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain).join("\n");
  assert.equal(compiled.hasDocument, true);
  assert.ok(text.includes("Bone Road"));
});

test("a renamed front matter folder stays in front of the manuscript", () => {
  const scene = documentNode("Opening", "scene", prose("Hello"));
  const chapter = folderNode("Tide", [scene]);
  let project = novel([chapter]);
  const front = project.publishing.children.find((child) => child.kind === "folder" && child.matter === "front");
  assert.equal(front?.kind, "folder");
  if (front?.kind !== "folder") {
    return;
  }
  project = renameNode(project, front.id, "Prelims");
  const loaded = bookFromFiles(filesForBook(project));
  assert.ok(loaded);
  if (!loaded) {
    return;
  }
  const renamed = findNode(loaded, front.id);
  assert.equal(renamed?.node.kind, "folder");
  if (renamed?.node.kind === "folder") {
    assert.equal(renamed.node.matter, "front");
    assert.equal(renamed.node.title, "Prelims");
  }
  const titlePage = front.children.find((child) => child.title === "Title page");
  assert.equal(titlePage?.kind, "document");
  if (titlePage?.kind !== "document") {
    return;
  }
  const compiled = compileOf(loaded, new Set([titlePage.id, scene.id, chapter.id]), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain).join("\n");
  const titleAt = text.indexOf("Bone Road");
  const helloAt = text.indexOf("Hello");
  assert.equal(titleAt >= 0, true);
  assert.equal(helloAt > titleAt, true);
});

test("a scene under an excluded folder still counts toward the word count", () => {
  const scene = documentNode("Opening", "scene", prose("Hello there"));
  const chapter = folderNode("Tide", [scene], false);
  const project = novel([chapter]);
  const titlePage = project.publishing.children
    .find((child) => child.kind === "folder" && child.matter === "front");
  assert.equal(titlePage?.kind, "folder");
  const page = titlePage?.kind === "folder" ? titlePage.children.find((child) => child.title === "Title page") : undefined;
  assert.equal(page?.kind, "document");
  if (page?.kind !== "document") {
    return;
  }
  const compiled = compileOf(project, new Set([page.id, scene.id]), defaultCompilePreferences(), 2026);
  assert.ok(compiled.paragraphs.map(paragraphPlain).join("\n").includes("2 words"));
});

test("documents can be the chapter level", () => {
  const first = documentNode("Tide", "scene", prose("Hello"));
  const second = documentNode("Dune", "scene", prose("After"));
  let project = createNovelProject();
  project = {
    ...project,
    manuscript: { ...project.manuscript, children: [first, second] },
  };
  project = tune(project, (preset) => ({
    ...preset,
    levels: [level(true, "Chapter", { number: "arabic" }), level(false, "")],
  }));
  const compiled = compileOf(project, new Set([first.id, second.id]), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  assert.equal(text[8], "Chapter 1");
  assert.equal(text[11], "Hello");
  assert.equal(text[20], "Chapter 2");
  assert.equal(text[23], "After");
  assert.equal(text.includes("#"), false);
  assert.equal(compiled.paragraphs[0]?.pageBreakBefore, true);
  assert.equal(compiled.paragraphs[12]?.pageBreakBefore, true);
});

test("divisions around a chapter share its first page", () => {
  const tide = folderNode("Tide", [documentNode("Opening", "scene", prose("Hello"))]);
  const dune = folderNode("Dune", [documentNode("Later", "scene", prose("After"))]);
  const part = folderNode("The Sea", [tide, dune]);
  const book = folderNode("South", [part]);
  let project = novel([book]);
  project = tune(project, (preset) => ({
    ...preset,
    levels: [
      level(false, ""),
      level(true, "", { title: true }),
      level(true, "Part", { number: "arabic" }),
      level(true, "Book", { number: "arabic" }),
    ],
  }));
  const compiled = compileOf(project, new Set(ticked(project)), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  const bookAt = text.indexOf("Book 1");
  const partAt = text.indexOf("Part 1");
  const tideAt = text.indexOf("Tide");
  const duneAt = text.indexOf("Dune");
  assert.equal(partAt, bookAt + 3);
  assert.equal(tideAt, partAt + 3);
  assert.equal(compiled.paragraphs[bookAt]?.pageBreakBefore, false);
  assert.equal(text.filter((line) => line === "Book 1").length, 1);
  assert.equal(text.filter((line) => line === "Part 1").length, 1);
  assert.equal(text.slice(tideAt + 1, duneAt).includes("Book 1"), false);
  assert.equal(text.slice(tideAt + 1, duneAt).includes("Part 1"), false);
});

test("a folder level left out does not print", () => {
  const chapter = folderNode("Tide", [documentNode("Opening", "scene", prose("Hello"))]);
  const part = folderNode("The Sea", [chapter]);
  const book = folderNode("South", [part]);
  let project = novel([book]);
  project = tune(project, (preset) => ({
    ...preset,
    levels: [
      level(false, ""),
      level(true, "", { title: true }),
      level(false, "Part", { title: true }),
      level(true, "Book", { number: "arabic" }),
    ],
  }));
  const scene = chapter.children[0];
  const compiled = compileOf(
    project,
    new Set([book.id, part.id, chapter.id, scene?.id ?? ""]),
    defaultCompilePreferences(),
    2026,
  );
  const text = compiled.paragraphs.map(paragraphPlain);
  const bookAt = text.indexOf("Book 1");
  assert.equal(text.indexOf("Tide"), bookAt + 3);
  assert.equal(text.includes("The Sea"), false);
  assert.equal(text.includes("Part"), false);
});

test("an included level with no heading starts a page and prints no title", () => {
  const opening = documentNode("Opening", "scene", prose("Hello"));
  const later = documentNode("Later", "scene", prose("After"));
  const next = documentNode("Next", "scene", prose("More"));
  const first = folderNode("Tide", [opening, later]);
  const second = folderNode("Dune", [next]);
  let project = novel([first, second]);
  project = tune(project, (preset) => ({
    ...preset,
    levels: [level(false, ""), level(true, "Chapter", { linesBefore: 0 })],
  }));
  const compiled = compileOf(
    project,
    new Set([first.id, second.id, opening.id, later.id, next.id]),
    defaultCompilePreferences(),
    2026,
  );
  const text = compiled.paragraphs.map(paragraphPlain);
  assert.deepEqual(text, ["Hello", "#", "After", "More"]);
  assert.equal(compiled.paragraphs[0]?.pageBreakBefore, true);
  assert.equal(compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "More")?.pageBreakBefore, true);
  assert.equal(text.includes("Tide"), false);
});

test("a heading already written still opens a chapter page", () => {
  const scene = documentNode("Opening", "scene", prose("Hello"));
  const chapter = folderNode("Tide", [scene]);
  let project = novel([chapter]);
  project = tune(project, (preset) => ({
    ...preset,
    levels: [level(false, ""), level(true, "Chapter", { blankOpening: true })],
  }));
  const compiled = compileOf(project, new Set([chapter.id, scene.id]), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  assert.equal(text[0], "");
  assert.equal(compiled.paragraphs[0]?.pageBreakBefore, true);
  assert.equal(text.includes("Hello"), true);
  assert.equal(text.includes("Tide"), false);
});

test("an empty nested folder does not move the chapter up a level", () => {
  const scene = documentNode("Opening", "scene", prose("Hello"));
  const excluded = documentNode("Draft", "scene", prose("Secret"));
  const notes = folderNode("Notes", [excluded]);
  const chapter = folderNode("Tide", [scene, notes]);
  let project = novel([chapter]);
  project = tune(project, (preset) => ({
    ...preset,
    levels: [level(false, ""), level(true, "Chapter", { title: true }), level(true, "Part", { number: "arabic" })],
  }));
  const compiled = compileOf(project, new Set([chapter.id, scene.id]), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  assert.ok(text.includes("Tide"));
  assert.equal(text.includes("Part 1"), false);
  assert.equal(text.includes("Notes"), false);
  assert.equal(text.includes("Secret"), false);
  assert.deepEqual(folderRanks(project.manuscript, new Set([chapter.id, scene.id])), [1]);
});

test("a page is a scene until that level is included", () => {
  const loose = documentNode("Loose", "scene", prose("Beside"));
  const scene = documentNode("Opening", "scene", prose("Hello"));
  const chapter = folderNode("Tide", [scene]);
  let project = createNovelProject();
  project = { ...project, manuscript: { ...project.manuscript, children: [loose, chapter] } };
  const compiled = compileOf(project, new Set([loose.id, chapter.id, scene.id]), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  assert.equal(text[0], "Beside");
  assert.equal(compiled.paragraphs[0]?.pageBreakBefore, true);
  assert.equal(text.includes("Loose"), false);
  assert.ok(text.includes("Tide"));
});

test("an empty variable is reported and a page token stays in the body", () => {
  const chapter = folderNode("Tide", [documentNode("Opening", "scene", prose("See {$page} and {$pen}"))]);
  const project = novel([chapter]);
  const included = new Set([project.manuscript.id, chapter.id, chapter.children[0]?.id ?? ""]);
  const compiled = compileOf(project, included, { ...defaultCompilePreferences(), author: "Ada Garth" }, 2026);
  const text = compiled.paragraphs.map(paragraphPlain).join("\n");
  assert.ok(text.includes("{$page}"));
  assert.ok(text.includes("{$pen}"));
  assert.deepEqual(compiled.missing, ["page", "pen"]);
});

test("a number and a title can share a line or take a line each", () => {
  const chapter = folderNode("Tide", [documentNode("Opening", "scene", prose("Hello"))]);
  let project = novel([chapter]);
  project = tune(project, (preset) => ({
    ...preset,
    levels: [
      level(false, ""),
      level(true, "Chapter", {
        title: true,
        number: "roman",
        join: "line",
        nameFont: "Courier",
        namePoints: 18,
        titleFont: "Palatino",
        titlePoints: 14,
      }),
    ],
  }));
  const compiled = compileOf(project, new Set(ticked(project)), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  const numberAt = text.indexOf("Chapter i");
  assert.equal(text[numberAt + 1], "Tide");
  const numberLine = compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "Chapter i");
  const titleLine = compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "Tide");
  assert.equal(numberLine?.runs[0]?.kind, "text");
  assert.equal(titleLine?.runs[0]?.kind, "text");
  if (numberLine?.runs[0]?.kind === "text" && titleLine?.runs[0]?.kind === "text") {
    assert.equal(numberLine.runs[0].font, "Courier");
    assert.equal(numberLine.runs[0].points, 18);
    assert.equal(titleLine.runs[0].font, "Palatino");
    assert.equal(titleLine.runs[0].points, 14);
  }
  project = tune(project, (preset) => ({
    ...preset,
    levels: preset.levels.map((entry, index) => (index === 1 ? { ...entry, join: "mark", mark: " — " } : entry)),
  }));
  const joined = compileOf(project, new Set(ticked(project)), defaultCompilePreferences(), 2026);
  assert.ok(joined.paragraphs.map(paragraphPlain).includes("Chapter i — Tide"));
});

test("a number or a name keeps its separator in front of the folder title", () => {
  const first = folderNode("My Chapter Name", [documentNode("Opening", "scene", prose("Hello"))]);
  const second = folderNode("My second chapter name", [documentNode("Later", "scene", prose("Again"))]);
  let project = novel([first, second]);
  project = tune(project, (preset) => ({
    ...preset,
    levels: [level(false, ""), level(true, "", { title: true, number: "arabic", join: "mark", mark: ": " })],
  }));
  const numbered = compileOf(project, new Set(ticked(project)), defaultCompilePreferences(), 2026).paragraphs.map(
    paragraphPlain,
  );
  assert.ok(numbered.includes("1: My Chapter Name"));
  assert.ok(numbered.includes("2: My second chapter name"));
  project = tune(project, (preset) => ({
    ...preset,
    levels: preset.levels.map((entry, index) =>
      index === 1 ? { ...entry, name: "Chapter", number: "none" } : entry,
    ),
  }));
  const named = compileOf(project, new Set(ticked(project)), defaultCompilePreferences(), 2026).paragraphs.map(
    paragraphPlain,
  );
  assert.ok(named.includes("Chapter: My Chapter Name"));
  assert.ok(named.includes("Chapter: My second chapter name"));
  project = tune(project, (preset) => ({
    ...preset,
    levels: preset.levels.map((entry, index) =>
      index === 1 ? { ...entry, name: "", number: "none", join: "line" } : entry,
    ),
  }));
  const plain = compileOf(project, new Set(ticked(project)), defaultCompilePreferences(), 2026).paragraphs.map(
    paragraphPlain,
  );
  assert.equal(plain.includes("My Chapter Name"), true);
  assert.equal(plain.some((line) => line.startsWith("\n")), false);
});

test("a new page after the heading starts the prose on the next page", () => {
  const chapter = folderNode("Tide", [documentNode("Opening", "scene", prose("Hello"))]);
  let project = novel([chapter]);
  project = tune(project, (preset) => ({
    ...preset,
    levels: [level(false, ""), level(true, "", { title: true, pageAfter: true })],
  }));
  const compiled = compileOf(project, new Set(ticked(project)), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  const tideAt = text.indexOf("Tide");
  const hello = compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "Hello");
  assert.deepEqual(text.slice(tideAt - 8, tideAt), ["", "", "", "", "", "", "", ""]);
  assert.equal(compiled.paragraphs[tideAt - 8]?.pageBreakBefore, true);
  assert.equal(compiled.paragraphs[tideAt]?.pageBreakBefore, false);
  assert.equal(hello?.pageBreakBefore, true);
});

test("lines above drop a page-break heading, and lines below follow its last line", () => {
  const chapter = folderNode("The Part Name", [documentNode("Opening", "scene", prose("Hello"))]);
  let project = novel([chapter]);
  project = tune(project, (preset) => ({
    ...preset,
    levels: [
      level(false, ""),
      level(true, "Part", { title: true, number: "arabic", pageBefore: true, pageAfter: true, linesBefore: 4, linesAfter: 3 }),
    ],
  }));
  const compiled = compileOf(project, new Set(ticked(project)), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  const partAt = text.indexOf("Part 1");
  assert.deepEqual(text.slice(partAt - 4, partAt), ["", "", "", ""]);
  assert.equal(text[partAt + 1], "The Part Name");
  assert.deepEqual(text.slice(partAt + 2, partAt + 5), ["", "", ""]);
  assert.equal(compiled.paragraphs[partAt - 4]?.pageBreakBefore, true);
  assert.equal(compiled.paragraphs[partAt]?.pageBreakBefore, false);
  assert.equal(compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "Hello")?.pageBreakBefore, true);
});

test("an included scene title keeps its font and alignment, and a number is ignored", () => {
  const first = folderNode("Tide", [documentNode("Opening", "scene", prose("Hello")), documentNode("Later", "scene", prose("After"))]);
  const second = folderNode("Dune", [documentNode("Next", "scene", prose("More"))]);
  let project = novel([first, second]);
  project = tune(project, (preset) => ({
    ...preset,
    levels: [level(false, ""), level(true, "Chapter", { title: true, number: "arabic", align: "right" })],
    scenes: { ...defaultHeading("Scene"), title: true, number: "arabic", titleFont: "Courier", titlePoints: 14, align: "left" },
  }));
  const compiled = compileOf(project, new Set(ticked(project)), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  const opening = compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "Opening");
  const chapter = compiled.paragraphs.find((paragraph) => paragraphPlain(paragraph) === "Chapter 1");
  assert.equal(opening?.align, "left");
  assert.equal(opening?.runs[0]?.kind, "text");
  if (opening?.runs[0]?.kind === "text") {
    assert.equal(opening.runs[0].font, "Courier");
    assert.equal(opening.runs[0].points, 14);
  }
  assert.equal(chapter?.align, "right");
  assert.equal(text.includes("Scene 1"), false);
  assert.equal(text.includes("#"), false);
});

test("folder ranks follow the included prose", () => {
  const scene = documentNode("Opening", "scene", prose("Hello"));
  const chapter = folderNode("Tide", [scene]);
  const part = folderNode("The Sea", [chapter]);
  const notes = folderNode("Notes", []);
  const loose = createNovelProject();
  assert.deepEqual(folderRanks(novel([part]).manuscript, ids(part)), [2, 1]);
  assert.deepEqual(folderRanks(novel([chapter, notes]).manuscript, ids(chapter, notes)), [1]);
  assert.deepEqual(folderRanks({ ...loose.manuscript, children: [scene] }, new Set([scene.id])), []);
  assert.deepEqual(folderRanks(loose.manuscript, new Set()), []);
});

function paragraphPlain(paragraph: CompileParagraph): string {
  return paragraph.runs
    .map((run) => {
      switch (run.kind) {
        case "text":
          return run.text;
        case "break":
          return "\n";
        case "page":
          return "";
        default: {
          const unexpected: never = run;
          return unexpected;
        }
      }
    })
    .join("");
}
