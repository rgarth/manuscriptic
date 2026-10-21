import assert from "node:assert/strict";
import { test } from "node:test";
import { bookFromFiles, filesForBook } from "./bookArchive.ts";
import { projectFromImport } from "./importedBook.ts";
import { documentNode, folderNode, openFolders, type FolderNode } from "./model/project.ts";

test("imported front matter replaces the empty pages and back matter stays", () => {
  const project = projectFromImport({
    title: "Castus",
    manuscript: [documentNode("Opening", "scene")],
    notes: null,
    extraNotes: [],
    frontMatter: [documentNode("Title Page", "scene"), documentNode("Copyright", "scene")],
    backMatter: null,
    trash: [],
  });
  const front = folderNamed(project.publishing, "Front Matter");
  const back = folderNamed(project.publishing, "Back Matter");
  assert.deepEqual(
    front.children.map((child) => (child.kind === "document" ? `${child.title}:${child.role}` : child.title)),
    ["Title Page:page", "Copyright:page"],
  );
  assert.deepEqual(
    back.children.map((child) => child.title),
    ["Acknowledgements", "About the Author"],
  );
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
  });
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

function folderNamed(publishing: FolderNode, title: string): FolderNode {
  const found = publishing.children.find((child) => child.kind === "folder" && child.title === title);
  if (found?.kind !== "folder") {
    throw new Error(`Missing ${title}`);
  }
  return found;
}
