import assert from "node:assert/strict";
import { test } from "node:test";
import type { DocumentNode, FolderNode } from "../model/project.ts";
import { projectFromScrivener, scrivenerTitle } from "./import.ts";

const scrivx = `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject>
  <Binder>
    <BinderItem UUID="DRAFT" Type="DraftFolder">
      <Title>Manuscript</Title>
      <Children>
        <BinderItem UUID="CHAP" Type="Folder">
          <Title>Chapter</Title>
          <MetaData><IncludeInCompile>Yes</IncludeInCompile></MetaData>
          <Children>
            <BinderItem UUID="SCENE" Type="Text">
              <Title>Opening</Title>
              <MetaData><IncludeInCompile>No</IncludeInCompile></MetaData>
            </BinderItem>
          </Children>
        </BinderItem>
        <BinderItem UUID="PART" Type="Text">
          <Title>Part</Title>
          <Children>
            <BinderItem UUID="KID" Type="Text">
              <Title>Kid</Title>
            </BinderItem>
          </Children>
        </BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="RES" Type="ResearchFolder">
      <Title>Research</Title>
      <Children>
        <BinderItem UUID="CHAR" Type="Text">
          <Title>Lyra &amp; Co</Title>
        </BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="TRASH" Type="TrashFolder">
      <Title>Trash</Title>
      <Children>
        <BinderItem UUID="GONE" Type="Text">
          <Title>Cut</Title>
        </BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>`;

test("a scrivener binder becomes the manuscript, the notes, and the trash", () => {
  const project = projectFromScrivener("Castus", {
    scrivx,
    content: {
      CHAP: "{\\rtf1\\ansi\\uc0 Chapter text}",
      SCENE: "{\\rtf1\\ansi\\uc0 Once}",
      PART: "{\\rtf1\\ansi\\uc0 Part text}",
      CHAR: "{\\rtf1\\ansi\\uc0 A name}",
      GONE: "{\\rtf1\\ansi\\uc0 Cut scene}",
    },
    notes: { SCENE: "{\\rtf1\\ansi\\uc0 Remember}" },
    synopsis: { CHAR: "A queen" },
  });
  assert.ok(project);
  assert.equal(project.title, "Castus");
  assert.equal(project.manuscript.title, "Manuscript");

  const chapter = project.manuscript.children[0];
  assert.equal(chapter?.kind, "folder");
  if (chapter?.kind !== "folder") {
    return;
  }
  assert.equal(chapter.title, "Chapter");
  assert.equal(chapter.includeInCompile, true);
  assert.deepEqual(
    chapter.children.map((child) => child.title),
    ["Chapter", "Opening"],
  );
  const opening = chapter.children[1];
  assert.equal(opening?.kind, "document");
  if (opening?.kind !== "document") {
    return;
  }
  assert.equal(opening.role, "scene");
  assert.equal(opening.includeInCompile, false);
  assert.equal(opening.content.content[0]?.type, "paragraph");

  const part = project.manuscript.children[1];
  assert.equal(part?.kind, "folder");
  if (part?.kind !== "folder") {
    return;
  }
  assert.deepEqual(
    part.children.map((child) => child.title),
    ["Part", "Kid"],
  );
  const kid = part.children[1];
  assert.equal(kid?.kind, "document");
  if (kid?.kind === "document") {
    assert.deepEqual(kid.content, { type: "doc", content: [{ type: "paragraph" }] });
  }

  const lyra = project.notes.children[0];
  assert.equal(lyra?.kind, "document");
  if (lyra?.kind === "document") {
    assert.equal(lyra.title, "Lyra & Co");
    assert.equal(lyra.role, "note");
  }
  const documentNotes = project.notes.children[1];
  assert.equal(documentNotes?.kind, "folder");
  if (documentNotes?.kind === "folder") {
    assert.equal(documentNotes.title, "Document notes");
    assert.deepEqual(
      documentNotes.children.map((child) => child.title),
      ["Opening", "Lyra & Co"],
    );
  }

  assert.equal(project.trash.children[0]?.title, "Cut");
  assert.equal(project.trash.children[0]?.kind, "document");
  if (project.trash.children[0]?.kind === "document") {
    assert.equal(project.trash.children[0].role, "scene");
  }
  assert.equal(project.view.selectedId, chapterText(chapter)?.id);
});

test("a scrivener file name is the book title", () => {
  assert.equal(scrivenerTitle("/Books/Castus.scriv"), "Castus");
  assert.equal(scrivenerTitle("/Books/Castus.scrivx"), "Castus");
});

test("a file that is not a scrivener binder is refused", () => {
  assert.equal(
    projectFromScrivener("Castus", { scrivx: "<Nope/>", content: {}, notes: {}, synopsis: {} }),
    null,
  );
});

function chapterText(chapter: FolderNode): DocumentNode | undefined {
  const text = chapter.children[0];
  return text?.kind === "document" ? text : undefined;
}
