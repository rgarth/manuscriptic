import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addScene,
  createNovelProject,
  deleteForever,
  isStoredInTrash,
  manuscriptWordCount,
  moveToTrash,
  parseEditorDoc,
  parseProject,
  setDocumentContent,
  wordCount,
  type EditorDoc,
} from "./project.ts";

const rootTitles = {
  manuscript: "Manuscript",
  characters: "Characters",
  places: "Places",
  frontMatter: "Front Matter",
  research: "Research",
  trash: "Trash",
} as const;

function textDoc(text: string, marks?: EditorDoc["content"][number]["content"]): EditorDoc {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: marks ?? [{ type: "text", text }] }],
  };
}

test("a new novel has the manuscript roots", () => {
  const project = createNovelProject();
  assert.equal(project.version, 1);
  assert.equal(project.title, "Untitled Novel");
  for (const [key, title] of Object.entries(rootTitles)) {
    const node = project[key as keyof typeof rootTitles];
    assert.equal(node.kind, "folder");
    assert.equal(node.title, title);
  }
  const chapter = project.manuscript.children[0];
  assert.equal(chapter?.kind, "folder");
  assert.equal(chapter?.title, "Chapter One");
  const opening = chapter?.kind === "folder" ? chapter.children[0] : undefined;
  assert.equal(opening?.kind, "document");
  assert.equal(opening?.title, "Opening");
});

test("adding a scene returns the id that was inserted", () => {
  const project = createNovelProject();
  const chapter = project.manuscript.children[0];
  assert.ok(chapter);
  const inserted = addScene(project, chapter.id);
  const nextChapter = inserted.project.manuscript.children[0];
  assert.equal(nextChapter?.kind, "folder");
  assert.ok(
    nextChapter?.kind === "folder" && nextChapter.children.some((child) => child.id === inserted.id),
  );
});

test("scene text accepts paragraphs with bold and italic only", () => {
  const parsed = parseEditorDoc({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "Hello", marks: [{ type: "bold", attrs: {} }] },
          { type: "text", text: " there", marks: [{ type: "italic" }] },
        ],
      },
    ],
  });
  assert.deepEqual(parsed, textDoc("", [
    { type: "text", text: "Hello", marks: [{ type: "bold" }] },
    { type: "text", text: " there", marks: [{ type: "italic" }] },
  ]));
  assert.equal(parseEditorDoc({ type: "doc", content: [{ type: "heading" }] }), null);
  assert.equal(
    parseEditorDoc({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hi", marks: [{ type: "link" }] }] }],
    }),
    null,
  );
});

test("an older project file loads into folders and documents", () => {
  const raw = JSON.stringify({
    version: 1,
    title: "Old",
    manuscript: {
      id: "m",
      title: "Manuscript",
      kind: "folder",
      includeInCompile: true,
      content: null,
      children: [
        {
          id: "s",
          title: "Opening",
          kind: "document",
          includeInCompile: true,
          children: [],
          content: textDoc("Hello there"),
        },
      ],
    },
    characters: emptyFolder("c", "Characters"),
    places: emptyFolder("p", "Places"),
    frontMatter: emptyFolder("f", "Front Matter"),
    research: emptyFolder("r", "Research"),
    trash: emptyFolder("t", "Trash"),
  });
  const project = parseProject(raw);
  if (!project) {
    throw new Error("old project did not parse");
  }
  const opening = project.manuscript.children[0];
  assert.equal(opening?.kind, "document");
  if (opening?.kind === "document") {
    assert.equal(wordCount(opening.content), 2);
  }
  assert.equal(manuscriptWordCount(project), 2);
});

test("manuscript word count ignores research", () => {
  const project = createNovelProject();
  const researchScene = addScene(project, project.research.id);
  const withResearch = setDocumentContent(researchScene.project, researchScene.id, textDoc("secret notes"));
  assert.equal(manuscriptWordCount(withResearch), 0);
});

test("prose cannot be written onto a folder", () => {
  const project = createNovelProject();
  const next = setDocumentContent(project, project.manuscript.id, textDoc("nope"));
  assert.equal(next.manuscript.kind, "folder");
  assert.deepEqual(next.manuscript.children, project.manuscript.children);
});

test("trash keeps a scene until it is deleted", () => {
  const project = createNovelProject();
  const chapter = project.manuscript.children[0];
  const opening = chapter?.kind === "folder" ? chapter.children[0] : undefined;
  if (!opening) {
    throw new Error("opening scene missing");
  }
  const trashed = moveToTrash(project, opening.id);
  assert.equal(isStoredInTrash(trashed, opening.id), true);
  assert.equal(trashed.manuscript.children[0]?.kind === "folder" && trashed.manuscript.children[0].children.length, 0);
  const gone = deleteForever(trashed, opening.id);
  assert.equal(isStoredInTrash(gone, opening.id), false);
  assert.equal(gone.trash.children.length, 0);
});

function emptyFolder(id: string, title: string) {
  return {
    id,
    title,
    kind: "folder",
    includeInCompile: true,
    content: null,
    children: [],
  };
}
