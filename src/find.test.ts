import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { EditorState } from "@tiptap/pm/state";
import { bookFromFiles, type BookFiles } from "./bookArchive.ts";
import { addLeaf, addSection } from "./model/binder.ts";
import { wordCount, type EditorDoc, type TextRun } from "./model/editorDoc.ts";
import { createNovelProject, documentNode, findNode, setDocumentContent, setView } from "./model/project.ts";
import {
  documentsIn,
  editorSchema,
  hitIndexAfter,
  hitsInDoc,
  hitsInProject,
  replaceAllInDoc,
  replaceAllInProject,
  replaceHit,
  selectDocument,
  spliceDocumentHits,
  stepAfterReplace,
  findMinChars,
  findPauseMs,
  pageFindHits,
} from "./find.ts";

function paragraph(text: string, marks?: TextRun["marks"]): EditorDoc {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text, ...(marks ? { marks } : {}) }] }],
  };
}

function plain(doc: EditorDoc, from: number, to: number): string {
  return editorSchema.nodeFromJSON(doc).textBetween(from, to);
}

test("find matches the editor positions, including marks and lists", () => {
  const styled: EditorDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "qxcat", marks: [{ type: "bold" }] },
        ],
      },
    ],
  };
  const hits = hitsInDoc(styled, "qxcat", false);
  assert.deepEqual(hits, [{ from: 7, to: 12 }]);
  assert.equal(plain(styled, hits[0]?.from ?? 0, hits[0]?.to ?? 0), "qxcat");

  const listed: EditorDoc = {
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "qxcat" }] }],
          },
        ],
      },
    ],
  };
  const listedHits = hitsInDoc(listed, "QxCat", false);
  assert.deepEqual(listedHits, [{ from: 3, to: 8 }]);
  assert.equal(plain(listed, 3, 8), "qxcat");
  assert.deepEqual(hitsInDoc(listed, "QxCat", true), []);
});

test("a match does not cross a paragraph or a line break", () => {
  const broken: EditorDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "qx" }, { type: "hardBreak" }, { type: "text", text: "cat" }],
      },
      { type: "paragraph", content: [{ type: "text", text: "cat" }] },
    ],
  };
  assert.deepEqual(hitsInDoc(broken, "qxcat", false), []);
  const hits = hitsInDoc(broken, "cat", false);
  assert.deepEqual(hits, [
    { from: 4, to: 7 },
    { from: 9, to: 12 },
  ]);
  assert.equal(plain(broken, 4, 7), "cat");
  assert.equal(plain(broken, 9, 12), "cat");
});

test("replace keeps the marks of the matched text and can clear it", () => {
  const doc: EditorDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Hello " },
          { type: "text", text: "qxcat", marks: [{ type: "bold" }] },
          { type: "text", text: " nap" },
        ],
      },
    ],
  };
  const [hit] = hitsInDoc(doc, "qxcat", false);
  assert.ok(hit);
  const replaced = replaceHit(doc, hit, "dog", "qxcat", false);
  assert.deepEqual(replaced?.content[0], {
    type: "paragraph",
    content: [
      { type: "text", text: "Hello " },
      { type: "text", text: "dog", marks: [{ type: "bold" }] },
      { type: "text", text: " nap" },
    ],
  });
  const cleared = replaceHit(doc, hit, "", "qxcat", false);
  assert.deepEqual(cleared?.content[0], {
    type: "paragraph",
    content: [{ type: "text", text: "Hello  nap" }],
  });
});

test("replace all rewrites every match in a paragraph", () => {
  const replaced = replaceAllInDoc(paragraph("qxcat and qxcat"), "qxcat", "dog", false);
  assert.equal(replaced.count, 2);
  assert.deepEqual(replaced.doc.content[0], {
    type: "paragraph",
    content: [{ type: "text", text: "dog and dog" }],
  });
});

test("replace across two runs uses the marks where the match starts", () => {
  const doc: EditorDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "qx" },
          { type: "text", text: "cat", marks: [{ type: "italic" }] },
        ],
      },
    ],
  };
  const [hit] = hitsInDoc(doc, "qxcat", false);
  assert.ok(hit);
  const replaced = replaceHit(doc, hit, "dog", "qxcat", false);
  assert.deepEqual(replaced?.content[0], {
    type: "paragraph",
    content: [{ type: "text", text: "dog" }],
  });
});

test("all documents skips the trash, and this document stays on the open one", () => {
  let project = createNovelProject();
  const scene = documentNode("Opening", "scene", paragraph("qxcat in the scene"));
  const note = documentNode("Villain", "note", paragraph("qxcat in the note"));
  const buried = documentNode("Old", "scene", paragraph("qxcat in the trash"));
  project = {
    ...project,
    manuscript: { ...project.manuscript, children: [scene] },
    notes: { ...project.notes, children: [...project.notes.children, note] },
    trash: { ...project.trash, children: [buried] },
    view: { ...project.view, selectedId: scene.id },
  };
  const book = hitsInProject(project, "book", scene.id, "qxcat", false);
  assert.deepEqual(
    book.map((hit) => hit.title),
    ["Opening", "Villain"],
  );
  const here = hitsInProject(project, "document", note.id, "qxcat", false);
  assert.deepEqual(
    here.map((hit) => hit.documentId),
    [note.id],
  );
  const replaced = replaceAllInProject(project, "book", scene.id, "qxcat", "dog", false);
  assert.equal(replaced.count, 2);
  const again = hitsInProject(replaced.project, "book", scene.id, "qxcat", false);
  assert.deepEqual(again, []);
  const trashed = findNode(replaced.project, buried.id);
  assert.equal(trashed?.node.kind, "document");
  if (trashed?.node.kind === "document") {
    assert.equal(hitsInDoc(trashed.node.content, "qxcat", false).length, 1);
  }
  const order = documentsIn(project, "book", scene.id).map((doc) => doc.id);
  assert.equal(hitIndexAfter(book, order, scene.id, book[0] ? book[0].to : 0), 1);
});

test("refreshing the open scene leaves the other results where they were", () => {
  const scene = documentNode("Opening", "scene", paragraph("qxcat in the scene"));
  const note = documentNode("Villain", "note", paragraph("qxcat in the note"));
  const stored = hitsInProject(
    {
      ...createNovelProject(),
      manuscript: { ...createNovelProject().manuscript, children: [scene] },
      notes: { ...createNovelProject().notes, children: [note] },
    },
    "book",
    scene.id,
    "qxcat",
    false,
  );
  const noteHit = stored.find((hit) => hit.documentId === note.id);
  const order = [scene.id, note.id];
  const edited = spliceDocumentHits(
    stored,
    scene.id,
    [
      { documentId: scene.id, title: scene.title, from: 1, to: 6 },
      { documentId: scene.id, title: scene.title, from: 13, to: 18 },
    ],
    "book",
    order,
  );
  assert.equal(
    edited.find((hit) => hit.documentId === note.id),
    noteHit,
  );
  assert.equal(edited.filter((hit) => hit.documentId === scene.id).length, 2);
  assert.deepEqual(
    edited.map((hit) => hit.documentId),
    [scene.id, scene.id, note.id],
  );
});

test("replace rewrites that scene and leaves the other results", () => {
  let project = createNovelProject();
  const scene = documentNode("Opening", "scene", paragraph("qxcat in the scene"));
  const note = documentNode("Villain", "note", paragraph("qxcat in the note"));
  project = {
    ...project,
    manuscript: { ...project.manuscript, children: [scene] },
    notes: { ...project.notes, children: [...project.notes.children, note] },
    view: { ...project.view, selectedId: scene.id },
  };
  const hits = hitsInProject(project, "book", scene.id, "qxcat", false);
  const sceneHit = hits.find((hit) => hit.documentId === scene.id);
  const noteHit = hits.find((hit) => hit.documentId === note.id);
  assert.ok(sceneHit);
  const step = stepAfterReplace(project, hits, sceneHit, "dog", "qxcat", false, "book");
  assert.ok(step);
  assert.equal(
    step.hits.find((hit) => hit.documentId === note.id),
    noteHit,
  );
  assert.equal(step.hits.some((hit) => hit.documentId === scene.id), false);
  const updated = findNode(step.project, scene.id);
  assert.equal(updated?.node.kind, "document");
  if (updated?.node.kind === "document") {
    assert.equal(hitsInDoc(updated.node.content, "dog", false).length, 1);
  }
});

test("a find query waits out a pause, and only the open page is marked", () => {
  assert.equal(findPauseMs, 400);
  assert.equal(findMinChars, 2);
  const scene = { documentId: "scene", title: "Opening", from: 1, to: 4 };
  const note = { documentId: "note", title: "Villain", from: 2, to: 5 };
  assert.deepEqual(pageFindHits([scene, note], "scene"), [{ from: 1, to: 4 }]);
  assert.deepEqual(pageFindHits([scene, note], "note"), [{ from: 2, to: 5 }]);
  assert.equal(pageFindHits([scene], "missing"), pageFindHits([], null));

  const words = Array.from({ length: 30000 }, (_, index) => (index % 11 === 0 ? "qxcat" : "stone"));
  let project = createNovelProject();
  const added = addLeaf(project, project.manuscript.id);
  project = setDocumentContent(added.project, added.id, paragraph(words.join(" ")));
  project = setView(project, { selectedId: added.id });
  const started = performance.now();
  const hits = hitsInProject(project, "document", added.id, "qxcat", false);
  const elapsed = performance.now() - started;
  assert.ok(hits.length > 1000, `expected many matches, got ${hits.length}`);
  assert.ok(elapsed < 300, `a 30000 word page took ${elapsed.toFixed(0)}ms`);
  assert.equal(pageFindHits(hits, added.id).length, hits.length);
  assert.equal(pageFindHits(hits, "other").length, 0);

  let state = EditorState.create({
    schema: editorSchema,
    doc: editorSchema.nodeFromJSON(paragraph(words.join(" "))),
  });
  const typing = performance.now();
  for (let index = 0; index < 40; index += 1) {
    state = state.apply(state.tr.insertText("a", 1));
  }
  const typed = performance.now() - typing;
  assert.equal(state.doc.textContent.startsWith("a"), true);
  assert.ok(typed < 500, `typing took ${typed.toFixed(0)}ms`);
});

test("opening a match expands the section that holds it", () => {
  let project = createNovelProject();
  const section = addSection(project, project.manuscript.id);
  project = section.project;
  const scene = addLeaf(project, section.id);
  project = setDocumentContent(scene.project, scene.id, paragraph("hello"));
  project = setView(project, { selectedId: project.manuscript.id, expanded: [project.manuscript.id] });
  const opened = selectDocument(project, scene.id);
  assert.equal(opened.view.selectedId, scene.id);
  assert.equal(opened.view.expanded?.includes(section.id), true);
});

const boneEaters = join(homedir(), "Desktop", "Bone Eaters.manuscriptic");

test("Bone Eaters can be searched without walking it on each letter", { skip: existsSync(boneEaters) ? false : "Desktop copy is not on this machine" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "bone-eaters-"));
  try {
    execFileSync("unzip", ["-o", "-q", boneEaters, "-d", dir]);
    const files: BookFiles = { "binder.json": readFileSync(join(dir, "binder.json"), "utf8") };
    for (const name of readdirSync(join(dir, "scenes"))) {
      files[`scenes/${name}`] = readFileSync(join(dir, "scenes", name), "utf8");
    }
    const project = bookFromFiles(files);
    assert.ok(project);
    if (!project) {
      return;
    }
    const pages = documentsIn(project, "book", project.view.selectedId);
    const words = pages.reduce((sum, page) => sum + wordCount(page.content), 0);
    assert.ok(words >= 30000, `expected a long book, counted ${words}`);
    const largest = pages.reduce((best, page) => (wordCount(page.content) > wordCount(best.content) ? page : best));
    const pageStarted = performance.now();
    const pageHits = hitsInProject(project, "document", largest.id, "the", false);
    const pageElapsed = performance.now() - pageStarted;
    assert.ok(pageHits.length > 10, `expected matches on the page, got ${pageHits.length}`);
    assert.ok(pageElapsed < 200, `this page took ${pageElapsed.toFixed(0)}ms`);
    const bookStarted = performance.now();
    const bookHits = hitsInProject(project, "book", largest.id, "the", false);
    const bookElapsed = performance.now() - bookStarted;
    assert.ok(bookHits.length > pageHits.length, `expected the book to hold more matches than one page`);
    assert.ok(bookElapsed < 400, `the whole book took ${bookElapsed.toFixed(0)}ms`);
    assert.equal(pageFindHits(bookHits, largest.id).length, pageHits.length);
    assert.equal(pageFindHits(bookHits, "missing-page").length, 0);
    let state = EditorState.create({
      schema: editorSchema,
      doc: editorSchema.nodeFromJSON(largest.content),
    });
    const typing = performance.now();
    for (let index = 0; index < 40; index += 1) {
      state = state.apply(state.tr.insertText("a", 1));
    }
    const typed = performance.now() - typing;
    assert.equal(state.doc.textContent.startsWith("a"), true);
    assert.ok(typed < 500, `typing in ${largest.title} took ${typed.toFixed(0)}ms`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
