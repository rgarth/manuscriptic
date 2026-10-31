import assert from "node:assert/strict";
import { test } from "node:test";
import { bookFromFiles, filesForBook } from "./bookArchive.ts";
import { projectFromImport } from "./importedBook.ts";
import { documentNode, folderNode, openFolders, type FolderNode } from "./model/project.ts";

test("imported front matter replaces the starter pages", () => {
  const project = projectFromImport({
    title: "Castus",
    manuscript: [documentNode("Opening", "scene")],
    notes: null,
    extraNotes: [],
    frontMatter: [documentNode("Title Page", "scene"), documentNode("Copyright", "scene")],
    backMatter: null,
    trash: [],
  }, false);
  const front = folderNamed(project.publishing, "Front Matter");
  const back = folderNamed(project.publishing, "Back Matter");
  assert.deepEqual(
    front.children.map((child) => (child.kind === "document" ? `${child.title}:${child.role}` : child.title)),
    ["Title Page:page", "Copyright:page"],
  );
  assert.deepEqual(back.children, []);
  assert.equal(project.manuscript.children[0]?.title, "Opening");
});

test("imported folders survive a save without the empty starter pages", () => {
  const project = projectFromImport({
    title: "Bone Eaters",
    manuscript: [documentNode("Opening", "scene")],
    notes: [folderNode("Characters", [documentNode("Fergus", "note")])],
    extraNotes: [],
    frontMatter: [folderNode("Paperback", [documentNode("Title Page", "page"), documentNode("Copyright", "page")])],
    backMatter: null,
    trash: [folderNode("Cut chapter", [documentNode("Cut", "scene")])],
  }, false);
  const opened = bookFromFiles(filesForBook(project));
  assert.ok(opened);
  const front = folderNamed(opened.publishing, "Front Matter");
  assert.deepEqual(
    front.children.map((child) => child.title),
    ["Paperback"],
  );
  const paperback = front.children[0];
  assert.equal(paperback?.kind, "folder");
  if (paperback?.kind === "folder") {
    assert.deepEqual(
      paperback.children.map((child) => child.title),
      ["Title Page", "Copyright"],
    );
  }
  assert.deepEqual(
    opened.notes.children.map((child) => child.title),
    ["Characters"],
  );
  const cut = opened.trash.children[0];
  const shown = openFolders(opened);
  assert.equal(shown.includes(opened.trash.id), false);
  assert.equal(cut?.kind, "folder");
  if (cut?.kind === "folder") {
    assert.equal(shown.includes(cut.id), false);
  }
});

test("manuscriptic pages stay beside imported matter until they are ticked", () => {
  const project = projectFromImport(
    {
      title: "Castus",
      manuscript: [documentNode("Opening", "scene")],
      notes: null,
      extraNotes: [],
      frontMatter: [documentNode("Title Page", "page")],
      backMatter: [documentNode("Also by", "page")],
      trash: [],
    },
    true,
  );
  const front = folderNamed(project.publishing, "Front Matter");
  const back = folderNamed(project.publishing, "Back Matter");
  assert.deepEqual(
    front.children.map((child) => child.title),
    ["Title Page", "Title page", "Copyright", "Dedication", "Epigraph"],
  );
  const starter = front.children.find((child) => child.title === "Title page");
  assert.equal(starter?.kind, "document");
  if (starter?.kind === "document") {
    assert.equal(starter.includeInCompile, false);
    const first = starter.content.content[0];
    assert.equal(first?.type, "paragraph");
    if (first?.type === "paragraph") {
      assert.equal(first.content?.[0]?.type === "text" ? first.content[0].text : "", "{$author}");
    }
  }
  assert.equal(front.children[0]?.kind === "document" ? front.children[0].includeInCompile : false, true);
  const included = project.compile.presets[0]?.included ?? [];
  assert.equal(front.children[0] ? included.includes(front.children[0].id) : false, true);
  assert.equal(starter ? included.includes(starter.id) : true, false);
  assert.deepEqual(
    back.children.map((child) => child.title),
    ["Also by", "Acknowledgements", "About the Author"],
  );
  const about = back.children.find((child) => child.title === "About the Author");
  assert.equal(about?.kind === "document" ? about.includeInCompile : true, false);
});

test("skipping manuscriptic matter leaves the imported pages only", () => {
  const project = projectFromImport(
    {
      title: "Castus",
      manuscript: [documentNode("Opening", "scene")],
      notes: null,
      extraNotes: [],
      frontMatter: null,
      backMatter: null,
      trash: [],
    },
    false,
  );
  assert.deepEqual(folderNamed(project.publishing, "Front Matter").children, []);
  assert.deepEqual(folderNamed(project.publishing, "Back Matter").children, []);
});

function folderNamed(publishing: FolderNode, title: string): FolderNode {
  const found = publishing.children.find((child) => child.kind === "folder" && child.title === title);
  if (found?.kind !== "folder") {
    throw new Error(`Missing ${title}`);
  }
  return found;
}
