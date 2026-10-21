import assert from "node:assert/strict";
import { test } from "node:test";
import { documentNode, type FolderNode } from "./model/project.ts";
import { projectFromImport } from "./importedBook.ts";

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

function folderNamed(publishing: FolderNode, title: string): FolderNode {
  const found = publishing.children.find((child) => child.kind === "folder" && child.title === title);
  if (found?.kind !== "folder") {
    throw new Error(`Missing ${title}`);
  }
  return found;
}
