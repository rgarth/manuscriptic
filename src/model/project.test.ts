import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addLeaf,
  addSection,
  deleteForever,
  emptyTrash,
  moveToTrash,
  placeNode,
  removal,
  restoreNode,
} from "./binder.ts";
import {
  addDictionaryWord,
  createNovelProject,
  isStoredInTrash,
  manuscriptWordCount,
  findNode,
  openFolders,
  parseProject,
  renameNode,
  setBookCompile,
  setDocumentContent,
  setView,
  type ProjectFile,
} from "./project.ts";
import { withTitleOnly } from "../bookCompile.ts";
import { parseEditorDoc, wordCount, type EditorDoc, type TextRun } from "./editorDoc.ts";

const rootTitles = {
  manuscript: "Manuscript",
  notes: "Notes",
  publishing: "Publishing",
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
  assert.equal(project.version, 2);
  assert.equal(project.title, "Untitled Novel");
  assert.deepEqual(project.manuscript.children, []);
  assert.equal(project.trash.children.length, 0);
  assert.equal(project.view.selectedId, project.manuscript.id);
  assert.deepEqual(project.view.expanded, [project.manuscript.id]);
  assert.deepEqual(openFolders(setView(project, { expanded: [project.manuscript.id, project.trash.id] })), [
    project.manuscript.id,
  ]);
  assert.equal(project.layout.font, "EB Garamond");
  assert.equal(project.layout.points, 12);
  assert.equal(project.layout.align, "justify");
  for (const [key, title] of Object.entries(rootTitles)) {
    const node = project[key as keyof typeof rootTitles];
    assert.equal(node.kind, "folder");
    assert.equal(node.title, title);
  }
  assert.deepEqual(
    project.notes.children.map((child) => child.title),
    ["Characters", "Places", "Misc.", "Research"],
  );
  assert.deepEqual(
    project.publishing.children.map((child) => child.title),
    ["Front Matter", "Back Matter", "Synopsis", "Query", "Back page"],
  );
  const front = project.publishing.children.find((child) => child.kind === "folder" && child.matter === "front");
  const back = project.publishing.children.find((child) => child.kind === "folder" && child.matter === "back");
  assert.equal(front?.kind, "folder");
  assert.equal(back?.kind, "folder");
  if (front?.kind === "folder") {
    assert.deepEqual(
      front.children.map((child) => child.title),
      ["Title page", "Copyright", "Dedication", "Epigraph"],
    );
  }
  if (back?.kind === "folder") {
    assert.deepEqual(
      back.children.map((child) => child.title),
      ["Acknowledgements", "About the Author"],
    );
  }
  const synopsis = project.publishing.children.find((child) => child.title === "Synopsis");
  assert.equal(synopsis?.kind, "document");
  if (synopsis?.kind === "document") {
    assert.equal(synopsis.role, "page");
    assert.equal(synopsis.content.content.length, 1);
  }
  const titlePage = front?.kind === "folder" ? front.children.find((child) => child.title === "Title page") : undefined;
  assert.equal(titlePage?.kind, "document");
  if (titlePage?.kind === "document") {
    const first = titlePage.content.content[0];
    assert.equal(first?.type, "paragraph");
    if (first?.type === "paragraph") {
      assert.equal(first.content?.[0]?.type === "text" ? first.content[0].text : "", "{$author}");
    }
  }
  assert.equal(project.compile.levels[0]?.include, false);
  assert.equal(project.compile.levels[1]?.include, true);
  assert.equal(project.compile.levels[1]?.name, "Chapter");
  assert.equal(project.compile.levels[1]?.title, true);
  assert.equal(project.compile.levels[1]?.number, "none");
  assert.equal(project.compile.sceneBreak, "hash");
  assert.equal(project.compile.scenes.title, false);
  assert.equal(project.compile.useAppAuthor, true);
  assert.equal(project.compile.format.spacing, "double");
});

test("compile settings without levels keep the default divisions", () => {
  const project = parseProject(
    JSON.stringify({
      version: 2,
      title: "Novel",
      manuscript: emptyFolder("m", "Manuscript"),
      notes: emptyFolder("n", "Notes"),
      publishing: emptyFolder("p", "Publishing"),
      trash: emptyFolder("t", "Trash"),
      compile: { chapterHeading: "word", partHeading: "number", sceneTitles: true, sceneBreak: "stars", titleOnly: ["pro"] },
    }),
  );
  assert.equal(project?.compile.levels.length, 2);
  assert.equal(project?.compile.levels[0]?.include, false);
  assert.equal(project?.compile.levels[1]?.name, "Chapter");
  assert.equal(project?.compile.levels[1]?.title, true);
  assert.equal(project?.compile.levels[1]?.number, "none");
  assert.equal(project?.compile.scenes.title, true);
  assert.equal(project?.compile.sceneBreak, "stars");
  assert.deepEqual(project?.compile.titleOnly, ["pro"]);
  assert.equal(project?.compile.useAppAuthor, true);
  assert.equal(project?.compile.format.font, "Times New Roman");
});

test("saving compile keeps the book's format and leaves an unchanged book alone", () => {
  const project = createNovelProject();
  const next = setBookCompile(project, {
    ...project.compile,
    format: { ...project.compile.format, spacing: "single" },
  });
  assert.equal(next.compile.format.spacing, "single");
  assert.equal(setBookCompile(next, next.compile), next);
});

test("an unnumbered folder stays out of the count until it is numbered again", () => {
  const project = createNovelProject();
  const marked = setBookCompile(project, withTitleOnly(project.compile, "prologue", true));
  assert.deepEqual(marked.compile.titleOnly, ["prologue"]);
  assert.equal(setBookCompile(marked, withTitleOnly(marked.compile, "prologue", true)), marked);
  const cleared = setBookCompile(marked, withTitleOnly(marked.compile, "prologue", false));
  assert.deepEqual(cleared.compile.titleOnly, []);
});

test("a broken folder level falls back and an empty list stays empty", () => {
  function book(compile: unknown) {
    return parseProject(
      JSON.stringify({
        version: 2,
        title: "Novel",
        manuscript: emptyFolder("m", "Manuscript"),
        notes: emptyFolder("n", "Notes"),
        publishing: emptyFolder("p", "Publishing"),
        trash: emptyFolder("t", "Trash"),
        compile,
      }),
    );
  }
  const broken = book({ levels: [{ include: true, name: "Chapter", heading: "nope" }] });
  assert.equal(broken?.compile.levels[1]?.include, true);
  assert.equal(broken?.compile.levels[1]?.title, true);
  assert.equal(broken?.compile.levels[1]?.number, "none");
  const legacy = book({
    levels: [{ include: true, name: "Chapter", heading: "numberTitle" }, { include: true, name: "Part", heading: "written" }],
    sceneTitles: true,
  });
  assert.equal(legacy?.compile.levels[0]?.number, "arabic");
  assert.equal(legacy?.compile.levels[0]?.title, true);
  assert.equal(legacy?.compile.levels[0]?.join, "mark");
  assert.equal(legacy?.compile.levels[0]?.mark, ": ");
  assert.equal(legacy?.compile.levels[1]?.blankOpening, true);
  assert.equal(legacy?.compile.scenes.title, true);
  const empty = book({ levels: [] });
  assert.deepEqual(empty?.compile.levels, []);
});

test("a publishing page the author already wrote is not replaced", () => {
  const raw = JSON.stringify({
    version: 2,
    title: "Novel",
    manuscript: emptyFolder("m", "Manuscript"),
    notes: emptyFolder("n", "Notes"),
    trash: emptyFolder("t", "Trash"),
    publishing: {
      id: "pub",
      title: "Publishing",
      kind: "folder",
      includeInCompile: true,
      children: [
        {
          id: "front",
          title: "Front Matter",
          kind: "folder",
          includeInCompile: true,
          children: [
            {
              id: "title",
              title: "Title page",
              kind: "document",
              role: "page",
              includeInCompile: true,
              content: textDoc("Keep this page"),
            },
          ],
        },
      ],
    },
  });
  const project = parseProject(raw);
  assert.ok(project);
  if (!project) {
    return;
  }
  assert.deepEqual(
    project.publishing.children.map((child) => child.id),
    ["front"],
  );
  const front = project.publishing.children[0];
  assert.equal(front?.kind, "folder");
  if (front?.kind === "folder") {
    assert.equal(front.matter, "front");
    const page = front.children[0];
    assert.equal(page?.kind, "document");
    if (page?.kind === "document") {
      assert.deepEqual(page.content, textDoc("Keep this page"));
    }
  }
});

test("a worked example has ordered chapters, scenes, and trash", () => {
  const project = sampleNovel();
  assert.deepEqual(
    project.manuscript.children.map((child) => child.title),
    ["Chapter One", "Chapter Two"],
  );
  const chapterOne = project.manuscript.children[0];
  const chapterTwo = project.manuscript.children[1];
  assert.equal(chapterOne?.kind, "folder");
  assert.equal(chapterTwo?.kind, "folder");
  if (chapterOne?.kind === "folder") {
    assert.deepEqual(
      chapterOne.children.map((child) => child.title),
      ["Opening", "The road"],
    );
  }
  if (chapterTwo?.kind === "folder") {
    assert.deepEqual(
      chapterTwo.children.map((child) => child.title),
      ["Morning", "The gate"],
    );
  }
  const opening = chapterOne?.kind === "folder" ? chapterOne.children[0] : undefined;
  assert.equal(opening?.kind, "document");
  if (opening?.kind === "document") {
    assert.equal(wordCount(opening.content), 2);
  }
  assert.deepEqual(
    project.trash.children.map((child) => child.title),
    ["Cut scene", "Discarded chapter"],
  );
  const cut = project.trash.children[0];
  assert.equal(cut?.kind, "document");
  assert.equal(cut?.origin?.parentId, chapterOne?.id);
  assert.equal(cut?.origin?.index, 2);
  assert.equal(cut?.origin?.root, "manuscript");
  const discarded = project.trash.children[1];
  assert.equal(discarded?.kind, "folder");
  if (discarded?.kind === "folder") {
    assert.deepEqual(
      discarded.children.map((child) => child.title),
      ["Epilogue draft"],
    );
  }
});

test("a new scene lands in the selected section, or just below the selected scene", () => {
  const project = sampleNovel();
  const chapter = project.manuscript.children[0];
  assert.ok(chapter?.kind === "folder");
  const opening = chapter.children[0];
  const road = chapter.children[1];
  assert.ok(opening);
  assert.ok(road);
  const below = addLeaf(project, opening.id);
  const afterScene = below.project.manuscript.children[0];
  assert.ok(afterScene?.kind === "folder");
  assert.deepEqual(
    afterScene.children.map((child) => child.id),
    [opening.id, below.id, road.id],
  );
  const inside = addLeaf(below.project, chapter.id);
  const afterSection = inside.project.manuscript.children[0];
  assert.ok(afterSection?.kind === "folder");
  assert.equal(afterSection.children[afterSection.children.length - 1]?.id, inside.id);
  assert.equal(afterSection.children[0]?.id, opening.id);
});

test("adding a scene returns the id that was inserted", () => {
  const project = sampleNovel();
  const chapter = project.manuscript.children[0];
  assert.ok(chapter);
  const inserted = addLeaf(project, chapter.id);
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
  const scene = addLeaf(project, chapter.id);
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
  const project = sampleNovel();
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
    assert.equal(opening.role, "scene");
    assert.equal(wordCount(opening.content), 2);
  }
  assert.equal(manuscriptWordCount(project), 2);
  assert.deepEqual(
    project.notes.children.map((child) => child.title),
    ["Characters", "Places", "Misc.", "Research"],
  );
  const frontMatter = project.publishing.children.find((child) => child.id === "f");
  assert.equal(frontMatter?.kind, "folder");
  assert.equal(frontMatter?.title, "Front Matter");
  if (frontMatter?.kind === "folder") {
    assert.deepEqual(
      frontMatter.children.map((child) => child.title),
      ["Title page", "Copyright", "Dedication", "Epigraph"],
    );
  }
  const backMatter = project.publishing.children.find((child) => child.title === "Back Matter");
  assert.equal(backMatter?.kind, "folder");
  if (backMatter?.kind === "folder") {
    assert.deepEqual(
      backMatter.children.map((child) => child.title),
      ["Acknowledgements", "About the Author"],
    );
  }
});

test("a saved publishing section stays as it was written", () => {
  const raw = JSON.stringify({
    version: 2,
    title: "Novel",
    dictionary: ["Castus", "castus"],
    manuscript: emptyFolder("m", "Manuscript"),
    notes: emptyFolder("n", "Notes"),
    trash: emptyFolder("t", "Trash"),
    publishing: {
      id: "pub",
      title: "Publishing",
      kind: "folder",
      includeInCompile: true,
      children: [
        emptyFolder("front", "Front Matter"),
        emptyFolder("back", "Back Matter"),
        {
          id: "thanks",
          title: "Acknowledgements",
          kind: "document",
          role: "page",
          includeInCompile: true,
          content: textDoc("For Castus"),
        },
        {
          id: "syn",
          title: "Synopsis",
          kind: "document",
          role: "page",
          includeInCompile: true,
          content: textDoc("A story"),
        },
      ],
    },
  });
  const project = parseProject(raw);
  if (!project) {
    throw new Error("project did not parse");
  }
  assert.deepEqual(
    project.publishing.children.map((child) => child.id),
    ["front", "back", "thanks", "syn"],
  );
  const thanks = project.publishing.children.find((child) => child.id === "thanks");
  assert.equal(thanks?.kind, "document");
  if (thanks?.kind === "document") {
    assert.equal(wordCount(thanks.content), 2);
  }
  const front = project.publishing.children.find((child) => child.id === "front");
  assert.equal(front?.kind, "folder");
  if (front?.kind === "folder") {
    assert.equal(front.matter, "front");
    assert.deepEqual(front.children, []);
  }
  const back = project.publishing.children.find((child) => child.id === "back");
  assert.equal(back?.kind, "folder");
  if (back?.kind === "folder") {
    assert.equal(back.matter, "back");
  }
  assert.deepEqual(project.dictionary, ["Castus"]);
  assert.equal(project.layout.font, "EB Garamond");
  assert.equal(project.layout.align, "justify");
  const added = addDictionaryWord(project, "  ");
  assert.deepEqual(added.dictionary, ["Castus"]);
  const named = addDictionaryWord(project, "Lyra");
  assert.deepEqual(named.dictionary, ["Castus", "Lyra"]);
});

test("a note stays a note, and a page stays a page", () => {
  const project = createNovelProject();
  const characters = project.notes.children.find((child) => child.title === "Characters");
  assert.ok(characters);
  const note = addLeaf(project, characters.id);
  const notes = note.project.notes.children.find((child) => child.id === characters.id);
  assert.equal(notes?.kind, "folder");
  const written = notes?.kind === "folder" ? notes.children.find((child) => child.id === note.id) : undefined;
  assert.equal(written?.kind, "document");
  if (written?.kind === "document") {
    assert.equal(written.role, "note");
    assert.equal(written.title, "New note");
  }
  const frontMatter = project.publishing.children.find((child) => child.title === "Front Matter");
  assert.ok(frontMatter);
  const page = addLeaf(project, frontMatter.id);
  const section = page.project.publishing.children.find((child) => child.id === frontMatter.id);
  const added = section?.kind === "folder" ? section.children.find((child) => child.id === page.id) : undefined;
  assert.equal(added?.kind, "document");
  if (added?.kind === "document") {
    assert.equal(added.role, "page");
    assert.equal(added.title, "New page");
  }
});

test("manuscript word count ignores research", () => {
  const project = createNovelProject();
  const research = project.notes.children.find((child) => child.title === "Research");
  assert.ok(research);
  const researchNote = addLeaf(project, research.id);
  const withResearch = setDocumentContent(researchNote.project, researchNote.id, textDoc("secret notes"));
  assert.equal(manuscriptWordCount(withResearch), 0);
});

test("prose cannot be written onto a folder", () => {
  const project = createNovelProject();
  const next = setDocumentContent(project, project.manuscript.id, textDoc("nope"));
  assert.equal(next.manuscript.kind, "folder");
  assert.deepEqual(next.manuscript.children, project.manuscript.children);
});

test("a root cannot be removed and trash deletes instead of moving", () => {
  const project = sampleNovel();
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
  assert.equal(deleting?.label, "Delete Permanently");
  assert.equal(removal(trashed, trashed.trash.id)?.action, "empty");
});

test("a trashed scene returns to its place, and emptying the trash keeps the book", () => {
  const project = sampleNovel();
  const cut = project.trash.children[0];
  const discarded = project.trash.children[1];
  assert.ok(cut);
  assert.ok(discarded);
  const restored = restoreNode(project, cut.id);
  const chapter = restored.manuscript.children[0];
  assert.ok(chapter?.kind === "folder");
  assert.deepEqual(
    chapter.children.map((child) => child.title),
    ["Opening", "The road", "Cut scene"],
  );
  assert.equal(findNode(restored, cut.id)?.node.origin, undefined);
  assert.equal(restored.trash.children[0]?.id, discarded.id);

  const emptied = emptyTrash(restored);
  assert.equal(emptied.trash.children.length, 0);
  assert.equal(findNode(emptied, discarded.id), null);
  assert.equal(findNode(emptied, cut.id)?.parent?.id, chapter.id);
  assert.equal(removal(emptied, emptied.trash.id), null);
});

test("a scene moves ahead of its neighbor, and a folder cannot contain itself", () => {
  let project = sampleNovel();
  const chapter = project.manuscript.children[0];
  assert.ok(chapter?.kind === "folder");
  const opening = chapter.children[0];
  const road = chapter.children[1];
  assert.ok(opening);
  assert.ok(road);
  const swapped = placeNode(project, road.id, opening.id, "before");
  const order = swapped.manuscript.children[0];
  assert.ok(order?.kind === "folder");
  assert.deepEqual(
    order.children.map((child) => child.id),
    [road.id, opening.id],
  );

  const stuck = placeNode(swapped, chapter.id, opening.id, "inside");
  assert.equal(stuck.manuscript.children[0]?.id, chapter.id);
  const rooted = placeNode(swapped, swapped.manuscript.id, chapter.id, "before");
  assert.equal(rooted.manuscript.children[0]?.id, chapter.id);

  const part = addSection(swapped, chapter.id);
  const blocked = placeNode(part.project, chapter.id, part.id, "inside");
  assert.equal(findNode(blocked, part.id)?.parent?.id, chapter.id);
});

test("binder roots do not rename", () => {
  const project = createNovelProject();
  assert.equal(renameNode(project, project.manuscript.id, "Draft").manuscript.title, "Manuscript");
  assert.equal(renameNode(project, project.notes.id, "Research").notes.title, "Notes");
  assert.equal(renameNode(project, project.publishing.id, "Print").publishing.title, "Publishing");
  assert.equal(renameNode(project, project.trash.id, "Bin").trash.title, "Trash");
});

test("sections stay separate, trash accepts anything, and trash returns only to its origin section", () => {
  let project = createNovelProject();
  const chapter = addSection(project, project.manuscript.id);
  project = chapter.project;
  const scene = addLeaf(project, chapter.id);
  project = scene.project;
  const note = addLeaf(project, project.notes.id);
  project = note.project;
  const page = addLeaf(project, project.publishing.id);
  project = page.project;

  const toNotes = placeNode(project, scene.id, note.id, "before");
  assert.equal(findNode(toNotes, scene.id)?.root, "manuscript");
  const toPages = placeNode(project, scene.id, page.id, "after");
  assert.equal(findNode(toPages, scene.id)?.root, "manuscript");
  const toBook = placeNode(project, note.id, chapter.id, "inside");
  assert.equal(findNode(toBook, note.id)?.root, "notes");
  const pageToBook = placeNode(project, page.id, project.manuscript.id, "inside");
  assert.equal(findNode(pageToBook, page.id)?.root, "publishing");

  const trashed = placeNode(project, scene.id, project.trash.id, "inside");
  const held = findNode(trashed, scene.id);
  assert.equal(held?.root, "trash");
  assert.equal(held?.node.kind, "document");
  if (held?.node.kind === "document") {
    assert.equal(held.node.role, "scene");
  }

  const refused = placeNode(trashed, scene.id, project.notes.id, "inside");
  assert.equal(findNode(refused, scene.id)?.root, "trash");

  const returned = placeNode(trashed, scene.id, chapter.id, "inside");
  const back = findNode(returned, scene.id);
  assert.equal(back?.root, "manuscript");
  assert.equal(back?.parent?.id, chapter.id);
  assert.equal(back?.node.kind, "document");
  if (back?.node.kind === "document") {
    assert.equal(back.node.role, "scene");
  }
  assert.equal(back?.node.origin, undefined);
});

test("trash keeps a scene until it is deleted", () => {
  const project = sampleNovel();
  const cut = project.trash.children[0];
  const discarded = project.trash.children[1];
  assert.ok(cut);
  assert.ok(discarded);
  assert.equal(isStoredInTrash(project, cut.id), true);
  const gone = deleteForever(project, cut.id);
  assert.equal(isStoredInTrash(gone, cut.id), false);
  assert.deepEqual(
    gone.trash.children.map((child) => child.id),
    [discarded.id],
  );
  const chapter = gone.manuscript.children[0];
  assert.equal(chapter?.kind, "folder");
  if (chapter?.kind === "folder") {
    assert.deepEqual(
      chapter.children.map((child) => child.title),
      ["Opening", "The road"],
    );
  }
});

test("a trash origin cannot name the trash", () => {
  const raw = JSON.stringify({
    version: 2,
    title: "Novel",
    manuscript: emptyFolder("m", "Manuscript"),
    notes: emptyFolder("n", "Notes"),
    publishing: emptyFolder("p", "Publishing"),
    trash: {
      id: "t",
      title: "Trash",
      kind: "folder",
      includeInCompile: true,
      children: [
        {
          id: "cut",
          title: "Cut scene",
          kind: "document",
          role: "scene",
          includeInCompile: true,
          content: textDoc("Gone"),
          origin: { parentId: "m", index: 0, root: "trash" },
        },
      ],
    },
  });
  const project = parseProject(raw);
  if (!project) {
    throw new Error("project did not parse");
  }
  assert.equal(project.trash.children[0]?.origin, undefined);
});

function sampleNovel(): ProjectFile {
  let project = createNovelProject();
  const first = addSection(project, project.manuscript.id);
  project = renameNode(first.project, first.id, "Chapter One");
  const second = addSection(project, project.manuscript.id);
  project = renameNode(second.project, second.id, "Chapter Two");

  const opening = addLeaf(project, first.id);
  project = renameNode(opening.project, opening.id, "Opening");
  project = setDocumentContent(project, opening.id, textDoc("Castus waited"));
  const road = addLeaf(project, opening.id);
  project = renameNode(road.project, road.id, "The road");

  const morning = addLeaf(project, second.id);
  project = renameNode(morning.project, morning.id, "Morning");
  const gate = addLeaf(project, morning.id);
  project = renameNode(gate.project, gate.id, "The gate");

  const cut = addLeaf(project, road.id);
  project = renameNode(cut.project, cut.id, "Cut scene");
  project = moveToTrash(project, cut.id);

  const discarded = addSection(project, project.manuscript.id);
  project = renameNode(discarded.project, discarded.id, "Discarded chapter");
  const draft = addLeaf(project, discarded.id);
  project = renameNode(draft.project, draft.id, "Epilogue draft");
  return moveToTrash(project, discarded.id);
}

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
