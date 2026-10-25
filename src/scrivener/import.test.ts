import assert from "node:assert/strict";
import { test } from "node:test";
import { bookFromFiles, filesForBook } from "../bookArchive.ts";
import { openFolders, type DocumentNode, type FolderNode, type ProjectFile } from "../model/project.ts";
import { projectFromScrivener, scrivenerTitle, type ScrivenerPackage } from "./import.ts";

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
  }, true);
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
    assert.deepEqual(paragraphLines(lyra), ["A name", "A queen"]);
  }
  const documentNotes = project.notes.children[1];
  assert.equal(documentNotes?.kind, "folder");
  if (documentNotes?.kind === "folder") {
    assert.equal(documentNotes.title, "Document notes");
    assert.deepEqual(
      documentNotes.children.map((child) => child.title),
      ["Opening"],
    );
    const openingNote = documentNotes.children[0];
    assert.equal(openingNote?.kind, "document");
    if (openingNote?.kind === "document") {
      assert.deepEqual(paragraphLines(openingNote), ["Remember"]);
    }
  }

  assert.equal(project.trash.children[0]?.title, "Cut");
  assert.equal(project.trash.children[0]?.kind, "document");
  if (project.trash.children[0]?.kind === "document") {
    assert.equal(project.trash.children[0].role, "scene");
  }
  assert.equal(project.view.selectedId, chapterText(chapter)?.id);
  const front = project.publishing.children.find((child) => child.title === "Front Matter");
  assert.equal(front?.kind, "folder");
  if (front?.kind === "folder") {
    assert.deepEqual(
      front.children.map((child) => child.title),
      ["Title page", "Copyright", "Dedication", "Epigraph"],
    );
  }
});

test("scrivener front matter replaces the empty pages and stays out of the notes", () => {
  const project = projectFromScrivener("Castus", {
    scrivx: `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject>
  <Binder>
    <BinderItem UUID="DRAFT" Type="DraftFolder">
      <Title>Manuscript</Title>
      <Children>
        <BinderItem UUID="SCENE" Type="Text"><Title>Opening</Title></BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="FRONT" Type="Folder">
      <Title>Front Matter</Title>
      <Children>
        <BinderItem UUID="TITLE" Type="Text"><Title>Title Page</Title></BinderItem>
        <BinderItem UUID="COPY" Type="Text"><Title>Copyright</Title></BinderItem>
      </Children>
    </BinderItem>
  </Binder>
</ScrivenerProject>`,
    content: { SCENE: "{\\rtf1\\ansi\\uc0 Once}", TITLE: "{\\rtf1\\ansi\\uc0 The book}" },
    notes: { FRONT: "{\\rtf1\\ansi\\uc0 Section type}", TITLE: "{\\rtf1\\ansi\\uc0 A note}" },
    synopsis: {},
  }, false);
  assert.ok(project);
  const opening = project.manuscript.children[0];
  assert.equal(opening?.kind, "document");
  assert.equal(opening?.title, "Opening");
  const front = project.publishing.children.find((child) => child.title === "Front Matter");
  const back = project.publishing.children.find((child) => child.title === "Back Matter");
  assert.equal(front?.kind, "folder");
  assert.equal(back?.kind, "folder");
  if (front?.kind === "folder" && back?.kind === "folder") {
    assert.deepEqual(
      front.children.map((child) => child.title),
      ["Title Page", "Copyright"],
    );
    const title = front.children[0];
    assert.equal(title?.kind, "document");
    if (title?.kind === "document") {
      assert.equal(title.role, "page");
    }
    assert.deepEqual(
      back.children.map((child) => child.title),
      [],
    );
  }
  assert.deepEqual(
    project.notes.children.map((child) => child.title),
    ["Characters", "Places", "Misc.", "Research"],
  );
});

test("scrivener folders outside the manuscript become notes", () => {
  const project = projectFromScrivener("Bone Eaters", {
    scrivx: `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject>
  <Binder>
    <BinderItem UUID="INFO" Type="Text"><Title>Novel Format</Title></BinderItem>
    <BinderItem UUID="DRAFT" Type="DraftFolder">
      <Title>Manuscript</Title>
      <Children>
        <BinderItem UUID="SCENE" Type="Text"><Title>Opening</Title></BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="CHARS" Type="Folder">
      <Title>Characters</Title>
      <Children>
        <BinderItem UUID="FERGUS" Type="Text"><Title>Fergus</Title></BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="PLACES" Type="Folder">
      <Title>Places</Title>
      <Children>
        <BinderItem UUID="MARSH" Type="Text"><Title>Hogmarsh</Title></BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="RES" Type="ResearchFolder">
      <Title>Research</Title>
      <Children>
        <BinderItem UUID="CHAR" Type="Text"><Title>Lyra</Title></BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="SHEETS" Type="Folder">
      <Title>Template Sheets</Title>
      <Children>
        <BinderItem UUID="SKETCH" Type="Text"><Title>Character Sketch</Title></BinderItem>
      </Children>
    </BinderItem>
  </Binder>
  <TemplateFolderUUID>SHEETS</TemplateFolderUUID>
</ScrivenerProject>`,
    content: {
      SCENE: "{\\rtf1\\ansi\\uc0 Once}",
      FERGUS: "{\\rtf1\\ansi\\uc0 A blacksmith}",
      MARSH: "{\\rtf1\\ansi\\uc0 A village}",
      CHAR: "{\\rtf1\\ansi\\uc0 A name}",
      SKETCH: "{\\rtf1\\ansi\\uc0 Blank sheet}",
    },
    notes: { FERGUS: "{\\rtf1\\ansi\\uc0 Keeps a hammer}" },
    synopsis: { FERGUS: "A hero" },
  }, false);
  assert.ok(project);
  assert.deepEqual(
    project.manuscript.children.map((child) => child.title),
    ["Opening"],
  );
  assert.deepEqual(
    project.notes.children.map((child) => child.title),
    ["Novel Format", "Characters", "Places", "Lyra"],
  );
  const characters = project.notes.children[1];
  assert.equal(characters?.kind, "folder");
  if (characters?.kind === "folder") {
    const fergus = characters.children[0];
    assert.equal(fergus?.kind, "document");
    if (fergus?.kind === "document") {
      assert.equal(fergus.role, "note");
      assert.deepEqual(paragraphLines(fergus), ["A blacksmith", "A hero", "Keeps a hammer"]);
    }
  }
  assert.equal(
    project.notes.children.some((child) => child.title === "Document notes"),
    false,
  );
});

test("an imported scrivener book can be saved and opened again", () => {
  const project = projectFromScrivener("Bone Eaters", boneEaters(), false);
  assert.ok(project);
  const opened = bookFromFiles(filesForBook(project));
  assert.ok(opened);

  const chapter = opened.manuscript.children[0];
  assert.equal(chapter?.kind, "folder");
  if (chapter?.kind === "folder") {
    assert.equal(chapter.title, "Chapter");
    assert.deepEqual(
      chapter.children.map((child) => child.title),
      ["Chapter", "Opening"],
    );
    const opening = chapter.children[1];
    assert.equal(opening?.kind, "document");
    if (opening?.kind === "document") {
      assert.deepEqual(paragraphLines(opening), ["Once"]);
    }
  }

  assert.deepEqual(
    opened.notes.children.map((child) => child.title),
    ["Characters", "Places", "Lyra", "Document notes"],
  );
  const characters = opened.notes.children[0];
  const places = opened.notes.children[1];
  assert.equal(characters?.kind, "folder");
  assert.equal(places?.kind, "folder");
  if (characters?.kind === "folder" && places?.kind === "folder") {
    const fergus = characters.children[0];
    const hogmarsh = places.children[0];
    assert.equal(fergus?.kind, "document");
    assert.equal(hogmarsh?.kind, "document");
    if (fergus?.kind === "document" && hogmarsh?.kind === "document") {
      assert.deepEqual(paragraphLines(fergus), ["A blacksmith", "A hero", "Keeps a hammer"]);
      assert.deepEqual(paragraphLines(hogmarsh), ["A village"]);
    }
  }
  const documentNotes = opened.notes.children[3];
  assert.equal(documentNotes?.kind, "folder");
  if (documentNotes?.kind === "folder") {
    assert.deepEqual(
      documentNotes.children.map((child) => child.title),
      ["Opening"],
    );
  }
  assert.equal(
    opened.notes.children.some((child) => child.title === "Character Sketch" || child.title === "Template Sheets"),
    false,
  );

  const front = folderNamed(opened, "Front Matter");
  const back = folderNamed(opened, "Back Matter");
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
    const title = paperback.children[0];
    assert.equal(title?.kind, "document");
    if (title?.kind === "document") {
      assert.equal(title.role, "page");
      assert.deepEqual(paragraphLines(title), ["The book"]);
    }
  }
  assert.deepEqual(
    back.children.map((child) => child.title),
    [],
  );

  const cut = opened.trash.children[0];
  assert.equal(cut?.kind, "folder");
  assert.equal(cut?.title, "Cut chapter");
  const shown = openFolders(opened);
  assert.equal(shown.includes(opened.trash.id), false);
  if (cut?.kind === "folder") {
    assert.equal(shown.includes(cut.id), false);
    assert.equal(cut.children[0]?.title, "Cut");
  }
});

test("a scrivener file name is the book title", () => {
  assert.equal(scrivenerTitle("/Books/Castus.scriv"), "Castus");
  assert.equal(scrivenerTitle("/Books/Castus.scrivx"), "Castus");
});

test("a file that is not a scrivener binder is refused", () => {
  assert.equal(
    projectFromScrivener("Castus", { scrivx: "<Nope/>", content: {}, notes: {}, synopsis: {} }, false),
    null,
  );
});

function chapterText(chapter: FolderNode): DocumentNode | undefined {
  const text = chapter.children[0];
  return text?.kind === "document" ? text : undefined;
}

function folderNamed(project: ProjectFile, title: string): FolderNode {
  const found = project.publishing.children.find((child) => child.kind === "folder" && child.title === title);
  if (found?.kind !== "folder") {
    throw new Error(`Missing ${title}`);
  }
  return found;
}

function boneEaters(): ScrivenerPackage {
  return {
    scrivx: `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject>
  <Binder>
    <BinderItem UUID="DRAFT" Type="DraftFolder">
      <Title>Manuscript</Title>
      <Children>
        <BinderItem UUID="CHAP" Type="Folder">
          <Title>Chapter</Title>
          <Children>
            <BinderItem UUID="SCENE" Type="Text"><Title>Opening</Title></BinderItem>
          </Children>
        </BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="CHARS" Type="Folder">
      <Title>Characters</Title>
      <Children>
        <BinderItem UUID="FERGUS" Type="Text"><Title>Fergus</Title></BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="PLACES" Type="Folder">
      <Title>Places</Title>
      <Children>
        <BinderItem UUID="MARSH" Type="Text"><Title>Hogmarsh</Title></BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="FRONT" Type="Folder">
      <Title>Front Matter</Title>
      <Children>
        <BinderItem UUID="PAPER" Type="Folder">
          <Title>Paperback</Title>
          <Children>
            <BinderItem UUID="TITLE" Type="Text"><Title>Title Page</Title></BinderItem>
            <BinderItem UUID="COPY" Type="Text"><Title>Copyright</Title></BinderItem>
          </Children>
        </BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="RES" Type="ResearchFolder">
      <Title>Research</Title>
      <Children>
        <BinderItem UUID="LYRA" Type="Text"><Title>Lyra</Title></BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="SHEETS" Type="Folder">
      <Title>Template Sheets</Title>
      <Children>
        <BinderItem UUID="SKETCH" Type="Text"><Title>Character Sketch</Title></BinderItem>
      </Children>
    </BinderItem>
    <BinderItem UUID="TRASH" Type="TrashFolder">
      <Title>Trash</Title>
      <Children>
        <BinderItem UUID="CUTS" Type="Folder">
          <Title>Cut chapter</Title>
          <Children>
            <BinderItem UUID="GONE" Type="Text"><Title>Cut</Title></BinderItem>
          </Children>
        </BinderItem>
      </Children>
    </BinderItem>
  </Binder>
  <TemplateFolderUUID>SHEETS</TemplateFolderUUID>
</ScrivenerProject>`,
    content: {
      CHAP: "{\\rtf1\\ansi\\uc0 Chapter text}",
      SCENE: "{\\rtf1\\ansi\\uc0 Once}",
      FERGUS: "{\\rtf1\\ansi\\uc0 A blacksmith}",
      MARSH: "{\\rtf1\\ansi\\uc0 A village}",
      TITLE: "{\\rtf1\\ansi\\uc0 The book}",
      LYRA: "{\\rtf1\\ansi\\uc0 A name}",
      SKETCH: "{\\rtf1\\ansi\\uc0 Blank sheet}",
      GONE: "{\\rtf1\\ansi\\uc0 Cut scene}",
    },
    notes: { SCENE: "{\\rtf1\\ansi\\uc0 Remember}", FERGUS: "{\\rtf1\\ansi\\uc0 Keeps a hammer}" },
    synopsis: { FERGUS: "A hero", LYRA: "A queen" },
  };
}

function paragraphLines(node: DocumentNode): string[] {
  return node.content.content.flatMap((block) => {
    if (block.type !== "paragraph") {
      return [];
    }
    const text = (block.content ?? []).map((inline) => (inline.type === "text" ? inline.text : "")).join("");
    return text.length > 0 ? [text] : [];
  });
}
