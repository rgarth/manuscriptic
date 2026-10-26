import assert from "node:assert/strict";
import { test } from "node:test";
import { addLeaf, addSection } from "./model/binder.ts";
import type { EditorDoc, TextRun } from "./model/editorDoc.ts";
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
