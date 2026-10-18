import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addScene,
  addSection,
  createNovelProject,
  deleteForever,
  isStoredInTrash,
  manuscriptWordCount,
  moveToTrash,
  parseProject,
  removal,
  setDocumentContent,
} from "./project.ts";
import { parseEditorDoc, wordCount, type EditorDoc, type TextRun } from "./editorDoc.ts";

const rootTitles = {
  manuscript: "Manuscript",
  characters: "Characters",
  places: "Places",
  frontMatter: "Front Matter",
  research: "Research",
  trash: "Trash",
} as const;

function textDoc(text: string, marks?: TextRun[]): EditorDoc {
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

test("a new scene lands in the selected section, or just below the selected scene", () => {
  const project = createNovelProject();
  const chapter = project.manuscript.children[0];
  assert.ok(chapter?.kind === "folder");
  const opening = chapter.children[0];
  assert.ok(opening);
  const below = addScene(project, opening.id);
  const afterScene = below.project.manuscript.children[0];
  assert.ok(afterScene?.kind === "folder");
  assert.deepEqual(
    afterScene.children.map((child) => child.id),
    [opening.id, below.id],
  );
  const inside = addScene(below.project, chapter.id);
  const afterSection = inside.project.manuscript.children[0];
  assert.ok(afterSection?.kind === "folder");
  assert.equal(afterSection.children[afterSection.children.length - 1]?.id, inside.id);
  assert.equal(afterSection.children[0]?.id, opening.id);
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

test("sections nest down to a scene", () => {
  let project = createNovelProject();
  const volume = addSection(project, project.manuscript.id);
  project = volume.project;
  const part = addSection(project, volume.id);
  project = part.project;
  const chapter = addSection(project, part.id);
  project = chapter.project;
  const scene = addScene(project, chapter.id);
  project = scene.project;

  const volumeNode = project.manuscript.children.find((child) => child.id === volume.id);
  assert.equal(volumeNode?.kind, "folder");
  const partNode =
    volumeNode?.kind === "folder"
      ? volumeNode.children.find((child) => child.id === part.id)
      : undefined;
  assert.equal(partNode?.kind, "folder");
  const chapterNode =
    partNode?.kind === "folder"
      ? partNode.children.find((child) => child.id === chapter.id)
      : undefined;
  assert.equal(chapterNode?.kind, "folder");
  const sceneNode =
    chapterNode?.kind === "folder"
      ? chapterNode.children.find((child) => child.id === scene.id)
      : undefined;
  assert.equal(sceneNode?.kind, "document");
  assert.equal(sceneNode?.title, "New scene");
});

test("a scene stays a leaf", () => {
  const project = createNovelProject();
  const chapter = project.manuscript.children[0];
  assert.ok(chapter?.kind === "folder");
  const opening = chapter.children[0];
  assert.ok(opening);
  const inserted = addSection(project, opening.id);
  const nextChapter = inserted.project.manuscript.children[0];
  assert.ok(nextChapter?.kind === "folder");
  assert.equal(
    nextChapter.children.some((child) => child.id === opening.id),
    true,
  );
  assert.equal(
    nextChapter.children.some((child) => child.id === inserted.id),
    true,
  );
  assert.equal(nextChapter.children.find((child) => child.id === opening.id)?.kind, "document");
});

test("scene text keeps bold and italic and drops unknown marks", () => {
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

test("a bullet list is part of the scene", () => {
  const parsed = parseEditorDoc({
    type: "doc",
    content: [
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "one two" }] }],
          },
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "three" }] },
              {
                type: "bulletList",
                content: [
                  {
                    type: "listItem",
                    content: [{ type: "paragraph", content: [{ type: "text", text: "four" }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.ok(parsed);
  assert.equal(wordCount(parsed), 4);
});

test("numbered lists and character styles stay in the scene", () => {
  const parsed = parseEditorDoc({
    type: "doc",
    content: [
      {
        type: "orderedList",
        attrs: { start: 3 },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "one" },
                  { type: "hardBreak" },
                  { type: "text", text: "two", marks: [{ type: "underline" }, { type: "strike", attrs: {} }] },
                  { type: "text", text: "3", marks: [{ type: "superscript" }] },
                  { type: "text", text: "4", marks: [{ type: "subscript" }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.deepEqual(parsed, {
    type: "doc",
    content: [
      {
        type: "orderedList",
        attrs: { start: 3 },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  { type: "text", text: "one" },
                  { type: "hardBreak" },
                  { type: "text", text: "two", marks: [{ type: "underline" }, { type: "strike" }] },
                  { type: "text", text: "3", marks: [{ type: "superscript" }] },
                  { type: "text", text: "4", marks: [{ type: "subscript" }] },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.equal(parsed ? wordCount(parsed) : 0, 2);
  assert.equal(
    parseEditorDoc({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hi", marks: [{ type: "code" }] }] }],
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

test("a root cannot be removed and trash deletes instead of moving", () => {
  const project = createNovelProject();
  assert.equal(removal(project, project.manuscript.id), null);
  const chapter = project.manuscript.children[0];
  assert.ok(chapter?.kind === "folder");
  const moving = removal(project, chapter.id);
  assert.equal(moving?.action, "move");
  assert.equal(moving?.folder, true);
  assert.equal(moving?.label, "Move to Trash");
  assert.match(moving?.message ?? "", /sections and scenes/);
  const opening = chapter.children[0];
  assert.ok(opening);
  const trashed = moveToTrash(project, opening.id);
  const deleting = removal(trashed, opening.id);
  assert.equal(deleting?.action, "delete");
  assert.equal(deleting?.label, "Delete");
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
