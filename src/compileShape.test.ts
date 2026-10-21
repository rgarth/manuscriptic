import assert from "node:assert/strict";
import { test } from "node:test";
import { bookFromFiles, filesForBook } from "./bookArchive.ts";
import { defaultCompilePreferences } from "./compilePrefs.ts";
import { buildCompile, type CompileParagraph } from "./compileShape.ts";
import { initialCompileTicks, toggleCompileRow } from "./compileTicks.ts";
import type { EditorDoc } from "./model/editorDoc.ts";
import {
  createNovelProject,
  documentNode,
  findNode,
  folderNode,
  renameNode,
  setBookCompile,
  setDocumentContent,
  type ProjectFile,
} from "./model/project.ts";

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

function novel(chapters: ReturnType<typeof folderNode>[]): ProjectFile {
  const project = createNovelProject();
  return {
    ...project,
    title: "Bone Road",
    manuscript: { ...project.manuscript, children: chapters },
  };
}

test("a chapter heading is the folder title and scenes keep their marks", () => {
  const opening = documentNode("Opening", "scene", marked("Hello world", "world"));
  const later = documentNode("Later", "scene", prose("After"));
  const chapter = folderNode("A Silver Tide", [opening, later]);
  const project = novel([chapter]);
  const compiled = buildCompile(project, initialCompileTicks(project), { ...defaultCompilePreferences(), author: "Ada Garth" }, 2026);
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
  project = setBookCompile(project, {
    ...project.compile,
    levels: project.compile.levels.map((level, index) => (index === 1 ? { ...level, heading: "number" } : level)),
    titleOnly: [prologue.id],
  });
  const compiled = buildCompile(project, initialCompileTicks(project), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  assert.ok(text.includes("Prologue"));
  assert.ok(text.includes("Chapter 1"));
  assert.equal(text.includes("Chapter 2"), false);
});

test("an unticked chapter is left out and the next number moves up", () => {
  const old = folderNode("Old", [documentNode("Draft", "scene", prose("Discarded"))]);
  const kept = folderNode("Tide", [documentNode("Opening", "scene", prose("Hello"))]);
  let project = novel([old, kept]);
  project = setBookCompile(project, {
    ...project.compile,
    levels: project.compile.levels.map((level, index) => (index === 1 ? { ...level, heading: "word" } : level)),
  });
  const included = toggleCompileRow(project, initialCompileTicks(project), old.id);
  const compiled = buildCompile(project, included, defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  assert.equal(text.includes("Discarded"), false);
  assert.ok(text.includes("Chapter One"));
  assert.equal(text.includes("Chapter Two"), false);
});

test("a part heading shares the first chapter page", () => {
  const chapter = folderNode("Tide", [documentNode("Opening", "scene", prose("Hello"))]);
  const part = folderNode("The Sea", [chapter]);
  let project = novel([part]);
  project = setBookCompile(project, {
    ...project.compile,
    levels: [...project.compile.levels, { include: true, name: "Part", heading: "number" }],
  });
  const compiled = buildCompile(project, initialCompileTicks(project), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  const partAt = text.indexOf("Part 1");
  const chapterAt = text.indexOf("Tide");
  assert.equal(partAt > 0, true);
  assert.equal(chapterAt, partAt + 2);
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
  const compiled = buildCompile(project, new Set([synopsis.id]), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  assert.deepEqual(text, ["The whole plot."]);
});

test("nothing ticked builds no document", () => {
  const project = novel([]);
  const compiled = buildCompile(project, new Set(), defaultCompilePreferences(), 2026);
  assert.equal(compiled.hasDocument, false);
});

test("a ticked scene under an unticked chapter is still in the file", () => {
  const scene = documentNode("Opening", "scene", prose("Hello"));
  const chapter = folderNode("Tide", [scene]);
  const project = novel([chapter]);
  const compiled = buildCompile(project, new Set([scene.id]), defaultCompilePreferences(), 2026);
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
  const compiled = buildCompile(project, new Set([titlePage.id]), defaultCompilePreferences(), 2026);
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
  const compiled = buildCompile(loaded, new Set([titlePage.id, scene.id, chapter.id]), defaultCompilePreferences(), 2026);
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
  const compiled = buildCompile(project, new Set([page.id]), defaultCompilePreferences(), 2026);
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
  project = setBookCompile(project, {
    ...project.compile,
    levels: [
      { include: true, name: "Chapter", heading: "number" },
      { include: false, name: "", heading: "none" },
    ],
  });
  const compiled = buildCompile(project, new Set([first.id, second.id]), defaultCompilePreferences(), 2026);
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
  project = setBookCompile(project, {
    ...project.compile,
    levels: [
      { include: false, name: "", heading: "none" },
      { include: true, name: "Chapter", heading: "title" },
      { include: true, name: "Part", heading: "number" },
      { include: true, name: "Book", heading: "number" },
    ],
  });
  const compiled = buildCompile(project, initialCompileTicks(project), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  const bookAt = text.indexOf("Book 1");
  const partAt = text.indexOf("Part 1");
  const tideAt = text.indexOf("Tide");
  const duneAt = text.indexOf("Dune");
  assert.equal(partAt, bookAt + 2);
  assert.equal(tideAt, partAt + 2);
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
  project = setBookCompile(project, {
    ...project.compile,
    levels: [
      { include: false, name: "", heading: "none" },
      { include: true, name: "Chapter", heading: "title" },
      { include: false, name: "Part", heading: "title" },
      { include: true, name: "Book", heading: "number" },
    ],
  });
  const scene = chapter.children[0];
  const compiled = buildCompile(
    project,
    new Set([book.id, part.id, chapter.id, scene?.id ?? ""]),
    defaultCompilePreferences(),
    2026,
  );
  const text = compiled.paragraphs.map(paragraphPlain);
  const bookAt = text.indexOf("Book 1");
  assert.equal(text.indexOf("Tide"), bookAt + 2);
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
  project = setBookCompile(project, {
    ...project.compile,
    levels: [
      { include: false, name: "", heading: "none" },
      { include: true, name: "Chapter", heading: "none" },
    ],
  });
  const compiled = buildCompile(
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
  project = setBookCompile(project, {
    ...project.compile,
    levels: [
      { include: false, name: "", heading: "none" },
      { include: true, name: "Chapter", heading: "written" },
    ],
  });
  const compiled = buildCompile(project, new Set([chapter.id, scene.id]), defaultCompilePreferences(), 2026);
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
  project = setBookCompile(project, {
    ...project.compile,
    levels: [
      { include: false, name: "", heading: "none" },
      { include: true, name: "Chapter", heading: "title" },
      { include: true, name: "Part", heading: "number" },
    ],
  });
  const compiled = buildCompile(project, new Set([chapter.id, scene.id]), defaultCompilePreferences(), 2026);
  const text = compiled.paragraphs.map(paragraphPlain);
  assert.ok(text.includes("Tide"));
  assert.equal(text.includes("Part 1"), false);
  assert.equal(text.includes("Notes"), false);
  assert.equal(text.includes("Secret"), false);
});

test("a page is a scene until that level is included", () => {
  const loose = documentNode("Loose", "scene", prose("Beside"));
  const scene = documentNode("Opening", "scene", prose("Hello"));
  const chapter = folderNode("Tide", [scene]);
  let project = createNovelProject();
  project = { ...project, manuscript: { ...project.manuscript, children: [loose, chapter] } };
  const compiled = buildCompile(project, new Set([loose.id, chapter.id, scene.id]), defaultCompilePreferences(), 2026);
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
  const compiled = buildCompile(project, included, { ...defaultCompilePreferences(), author: "Ada Garth" }, 2026);
  const text = compiled.paragraphs.map(paragraphPlain).join("\n");
  assert.ok(text.includes("{$page}"));
  assert.ok(text.includes("{$pen}"));
  assert.deepEqual(compiled.missing, ["page", "pen"]);
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
