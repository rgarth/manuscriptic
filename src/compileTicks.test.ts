import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collapsedCompileFolders,
  compileRows,
  initialCompileTicks,
  rememberCompile,
  shownCompileRows,
  toggleCompileRow,
} from "./compileTicks.ts";
import { createNovelProject, documentNode, folderNode, type ProjectFile } from "./model/project.ts";

function novel(): ProjectFile {
  const opening = documentNode("Opening", "scene");
  const chapter = folderNode("Tide", [opening]);
  const project = createNovelProject();
  return { ...project, manuscript: { ...project.manuscript, children: [chapter] } };
}

test("the export lists the manuscript and then the publishing pages", () => {
  const project = novel();
  const titles = compileRows(project).map((row) => row.title);
  assert.equal(titles[0], "Manuscript");
  assert.ok(titles.includes("Tide"));
  assert.ok(titles.includes("Opening"));
  const front = titles.indexOf("Front Matter");
  const synopsis = titles.indexOf("Synopsis");
  const query = titles.indexOf("Query");
  assert.equal(front > titles.indexOf("Opening"), true);
  assert.equal(synopsis > titles.indexOf("Epigraph"), true);
  assert.equal(query, synopsis + 1);
  assert.equal(titles[titles.length - 1], "Back page");
});

test("only a manuscript folder can leave the numbering", () => {
  const opening = documentNode("Opening", "scene");
  const chapter = folderNode("Tide", [opening]);
  const part = folderNode("The Sea", [chapter]);
  const project = createNovelProject();
  const book = { ...project, manuscript: { ...project.manuscript, children: [part] } };
  const rows = compileRows(book);
  function numbering(title: string): boolean | undefined {
    return rows.find((row) => row.title === title)?.numbering;
  }
  assert.equal(numbering("Manuscript"), false);
  assert.equal(numbering("The Sea"), true);
  assert.equal(numbering("Tide"), true);
  assert.equal(numbering("Opening"), false);
  assert.equal(numbering("Front Matter"), false);
  assert.equal(numbering("Synopsis"), false);
});

test("the compile list opens on the top headings", () => {
  const rows = compileRows(novel());
  const shown = shownCompileRows(rows, collapsedCompileFolders(rows)).map((row) => row.title);
  assert.deepEqual(shown, ["Manuscript", "Front Matter", "Back Matter", "Synopsis", "Query", "Back page"]);
});

test("a collapsed folder hides its pages and keeps the folder", () => {
  const project = novel();
  const rows = compileRows(project);
  const chapter = rows.find((row) => row.title === "Tide");
  assert.ok(chapter);
  const shown = shownCompileRows(rows, new Set([chapter.id]));
  assert.equal(shown.some((row) => row.title === "Tide"), true);
  assert.equal(shown.some((row) => row.title === "Opening"), false);
  assert.equal(shown.some((row) => row.title === "Synopsis"), true);
});

test("unticking a chapter removes its scenes and the next tick brings the manuscript back", () => {
  const project = novel();
  const chapter = project.manuscript.children[0];
  assert.equal(chapter?.kind, "folder");
  if (chapter?.kind !== "folder") {
    return;
  }
  const without = toggleCompileRow(project, initialCompileTicks(project), chapter.id);
  assert.equal(without.has(chapter.id), false);
  assert.equal(without.has(chapter.children[0]?.id ?? ""), false);
  assert.equal(without.has(project.manuscript.id), true);
  const scene = chapter.children[0];
  assert.equal(scene?.kind, "document");
  if (scene?.kind !== "document") {
    return;
  }
  const restored = toggleCompileRow(project, without, scene.id);
  assert.equal(restored.has(scene.id), true);
  assert.equal(restored.has(chapter.id), true);
  assert.equal(restored.has(project.manuscript.id), true);
});

test("remember writes the ticks and leaves an existing page's text alone", () => {
  const project = novel();
  const synopsis = project.publishing.children.find((child) => child.title === "Synopsis");
  assert.equal(synopsis?.kind, "document");
  if (synopsis?.kind !== "document") {
    return;
  }
  const ticks = initialCompileTicks(project);
  ticks.delete(synopsis.id);
  ticks.delete(project.manuscript.id);
  const remembered = rememberCompile(project, ticks);
  const again = remembered.publishing.children.find((child) => child.id === synopsis.id);
  assert.equal(again?.kind, "document");
  if (again?.kind === "document") {
    assert.equal(again.includeInCompile, false);
    assert.deepEqual(again.content, synopsis.content);
  }
  assert.equal(remembered.manuscript.includeInCompile, false);
  assert.equal(rememberCompile(remembered, ticks), remembered);
});
