# Export plan

The export is one `.docx`. The ticks decide what is in it. The manuscript starts included, and so do the publishing pages marked for compile. The author can untick any of them, including the whole manuscript, so a publisher who wants the synopsis as its own file gets that and nothing else. It is not a dump of the binder, and it is not a second word processor. Nothing in this document is built yet.

## What other apps actually do

Scrivener compiles the draft in binder order, skipping anything whose Include in Compile box is off. Front matter and back matter are not inside the draft. At compile time you pick one front-matter folder and one back-matter folder. The novel template keeps several of those folders (manuscript, paperback, ebook) because each product wants different pages. A section type (chapter, scene, front matter) is then paired with a section layout: page break, chapter title, or As-Is. As-Is keeps the editor’s formatting. Anything else is overwritten by the compile format. Placeholders such as `<$author>` and `<$PROJECTTITLE>` are replaced when the file is built, not while you type. Author, address, phone, and email live in application settings. Headers and footers are part of the compile format and can contain `<$page>`.

novelWriter’s manuscript build is a named filter over the project tree. The build dialog lists the documents that will be included, then you pick a format. Its stock title page is a real document with tokens for the author and the word count (`[field:textWords]`), filled from project data. The docx writer emits ordinary Word paragraphs and headings. It does not try to be Word.

Atticus keeps front matter in its own section and gives each page an Include in choice: all, ebook, print, or none. Title, copyright, and the contents page are generated from the book details. You can replace that text. Vellum, downstream of all of these, wants a clean docx whose chapter and matter titles are Heading 1, and it reads the title and author from the document properties. It throws away a title page and a contents page you already made, because it makes its own.

The useful idea in all four is the same. The book and the pages around the book are separate. Which of those pages go out is chosen for a particular export. Identity and page furniture are data, substituted at the end. The manuscript is one typesetting, applied to every page of the book. Front matter and back matter keep the formatting written into those pages.

## What a submission file is

William Shunn’s modern manuscript format is what a lot of agents still name when they ask for pages. One-inch margins. 12-point Times New Roman. Double spaced. Half-inch first-line indent. No gap between paragraphs. Left aligned, not justified. Black only. The first page carries the legal name, address, phone, and email at the top left, and an approximate word count at the top right, rounded to the nearest hundred. The title sits about a third of the way down, then the byline. The byline can be a pen name. Later pages carry a running header: surname, a short title, and the page number. The first page does not repeat that header.

A novel query is a different object. Agents usually want the letter in the email, a synopsis as its own short document, and a sample (often the first pages, or the first three chapters) in that manuscript shape. The synopsis is present tense and tells the whole plot, including the ending. Length varies: one page, two pages, or about 500 words. The letter is a hook, the book’s facts (title, genre, word count), and a short bio.

Those rules are the default for the book. They are not a second product. Spacing is the Compile setting. Double is the default, because that is what most of these guides ask for. A house that wants something else is a change to that setting. An author who is asked for Courier changes the font.

Checked against Shunn’s novel sample, Shunn on parts and on scene breaks, the Slushpile agent guide, Midwest Writers Workshop, Loiacono Literary Agency, Baen, and TWB Press. They describe one manuscript. They do not describe a different typesetting per house.

## Parts, chapters, and scenes

The binder does not label a folder as a part, a chapter, or a scene. An author may put one document under the manuscript for each chapter. They may put a folder around the scenes of a chapter. They may go further: volume, then part, then chapter, then scene. Another book may mix those. The compile settings do not guess. They list levels from the pages outward.

A level is either included or left out. Left out, that depth is only organization: the file walks through it. Included, it is a division. The division can print a heading, or not. The heading uses a name the author types, such as Chapter, Part, or Book, and one of: the title, `Chapter 1`, `Chapter 1: Title`, `Chapter One`, or nothing generated because the heading is already in the text. No heading still starts a page, without the drop. The innermost included division starts the page. Included divisions around it print on that same page, the first time they appear, and not again on the next chapter. A title-only folder stays out of the number count, so a prologue does not become Chapter 1.

Pages are the first level. While that level is left out, a document is a scene: its binder title is not printed, and a break separates it from the next scene. Turning the page level on is how a book whose chapters are documents gets a heading and a page for each one.

Guidelines agree on the furniture and leave the words to the book:

- A chapter starts on a new page. The heading is centered, dropped down the page, with a couple of blank lines before the text. Shunn puts it about a third of the way down. TWB Press says about eight lines. Page numbers run through the whole manuscript and do not restart.
- The heading itself has no required shape. Shunn’s novel sample uses the title alone (“A Silver Tide”). The Slushpile guide says pick one of “Chapter One”, “Chapter 1”, or a title, and stick to it. Shunn’s note on parts says the same thing in more words: number, title, or both, including “Part Two”, “Book III”, or a date. Consistency is the rule.
- A part is not its own page in a submission. Print books often do that. Shunn puts the part heading about a third of the way down, then the first chapter heading on that same page. Later chapters in the part are only the chapter heading.
- Scene titles are working labels. They are not printed unless the author asks. The break between scenes is a mark on its own centered line. Shunn uses `#`. Midwest Writers and TWB Press use asterisks (`* * *` or `***`). Loiacono wants `* * *`. A blank line alone is the option those guides warn against, because it vanishes when the break falls at the bottom of a page.
- The paragraph after a break is indented, like every other paragraph of the book. Shunn is explicit that an unindented first paragraph is book design, not manuscript format. Loiacono asks for the line after the asterisks to be flush left. The default follows Shunn, because the book has one paragraph style.

These choices are stored with the book and edited from Compile. Two novels by the same author often want different headings. The font and the spacing do not.

Scene titles are off. Turning them on prints the scene’s binder title instead of a break, for documents that are not themselves a division. While that is off, the break between two scenes is one of `#`, `* * *`, or a blank line. The default is `#`. Nothing is inserted before the first scene of a division.

## What this project already has

A new book’s Publishing section is built by `arrangePublishing` in `src/model/project.ts`.

- Front Matter: Title page, Copyright, Dedication, Epigraph
- Back Matter: Acknowledgements, About the Author
- Beside those folders: Synopsis, Back page

Those documents are empty. Their role is `page`. `includeInCompile` is stored on every binder node and is true for pages. Scrivener import already copies the checkbox. Nothing in the interface reads it, and nothing exports.

The book file also stores one writing layout: font, point size, and alignment (`PageLayout`). Indent and line spacing are application preferences for the screen (`editorPrefs`). They are not in the document. A paragraph in `EditorDoc` is text with marks: bold, italic, underline, strike, superscript, subscript, plus lists. There is no heading style, no per-paragraph font, and no page size.

Settings today are Files, Application Theme, Writing, and Dictionary. There is no author, and no compile format.

## What is missing

The publishing set covers a printed book’s matter and a synopsis. It does not cover a submission.

Add one document, Query, beside Synopsis. It is a drafting page for the letter. It is not front matter, because it does not belong in the printed book. Do not add a table of contents, half title, or “also by” page in this pass. Vellum and Atticus generate those, and this pass is the submission file, not the print file.

Starter text belongs only on pages where the structure is the content. New books get it when the empty page is first created. Opening an existing book does not rewrite pages the author already has. `arrangePublishing` may still create a missing Query as an empty document in an old book. Only a brand-new page receives starter text.

| Page | Starter text |
| --- | --- |
| Title page | The contact block, title, byline, and word count, using variables |
| Copyright | `Copyright {$year} {$author}` |
| Query | The slots of a letter: hook, the sentence with title and word count, two short beats, bio, sign-off |
| Synopsis, Dedication, Epigraph, Acknowledgements, About the Author, Back page | Empty |

Empty synopsis and query pages can show an editor hint. The hint is not part of the document, so it cannot leak into the docx. The synopsis hint says: present tense, the whole plot, including the ending. The query hint says: this is usually pasted into the email, not bound into the manuscript.

## Variables

Variables are substituted when the docx is built. They stay visible in the editor, so a change in Settings is picked up by the next export. They are not baked in at file creation.

The syntax is `{$name}`. The set is closed.

| Variable | Source |
| --- | --- |
| `{$author}` | Legal name, Settings |
| `{$pen}` | Pen name, Settings. The title-page byline uses this |
| `{$address}` | Settings. Line breaks in the setting become line breaks in the file |
| `{$phone}` | Settings |
| `{$email}` | Settings |
| `{$title}` | The book’s title |
| `{$words}` | Word count of the manuscript, counting documents whose `includeInCompile` is set |
| `{$year}` | The year of the export |
| `{$page}` | Page number, valid in the header and footer only |

`{$pen}` does not silently become the legal name. A variable with no value is left as written, and the export reports it once. An unknown `{$...}` is reported the same way. That is the same rule as a save that did not happen: the file must not look finished when a slot was empty.

Author, pen name, address, phone, and email are application settings, with the other preferences. They are not copied into each book. Title and word count come from the open book.

The header is a string in the same syntax. The submission default is `{$author} / {$title} / {$page}`. Shunn uses a surname. Parsing a surname out of a full name gets compound names wrong, so the header stays an editable string. The author can type the surname.

Scrivener’s `<$author>` tags are not this syntax. Mapping them on import can wait. This pass does not grow a second placeholder language.

## Where the settings live

Settings gains a Compile section with two panes.

Common is everything a later format would share.

- Author, pen name, address, phone, email
- Margins, in inches, default 1 on every side
- Header and footer strings
- Page numbers: off, in the header, or in the footer
- Different first page, on by default, so a title page is not repeated in the header

Docx is the Word appearance.

- Font and size. Default Times New Roman, 12
- Line spacing: single, 1.5, or double. Default double
- Space before and after a paragraph. Default 0
- First-line indent. Default half an inch
- Alignment. Default left
- A switch, off by default: use the book’s font and point size instead of the values above

That switch is the pass-through for the book. A scene stores words and marks. Bold and italic are in the text. Centered, right-aligned, and “a third of the way down the page” are not. The compile settings supply those for the manuscript, on every page. When the switch is on, font and size come from the book’s writing layout instead. Alignment, spacing, indent, margins, and the header still come from Compile. The screen’s “comfortable” spacing is not the manuscript. Marks always pass through.

Front matter and back matter keep the paragraphs the author wrote. The Compile spacing, indent, and font apply to the manuscript.

Typesetting is an application preference, like the theme. One author submits every book the same way. Folder levels and the scene break are saved in the book, because they describe that novel. Compile is where both are edited. There is no list of publisher templates. The guides above differ in the font, the scene mark, and the heading, and those are already settings. A named setup for one house would copy a page they can change, and it would hide the same three choices. A second saved setup earns a name when a real export needs something these settings cannot say. Baen asking for RTF is a later file type, not a template.

## What the export includes

File → Export opens a dialog and writes one file.

Every scene starts ticked, and so does every folder. The author can untick one, which is how an old version of a chapter stays in the binder and stays out of the file. Unticking a folder leaves out everything inside it in the dialog. They can also untick the whole manuscript. A ticked document is still written when its folder is not, without that folder’s heading. Numbers are counted over the divisions of that level that remain. Levels and scene breaks follow the choices saved with the book, and they apply only to the manuscript portion of the file. A heading is centered text in the manuscript style. Submission guides want the page to look typed. A Word heading style is for a later print export, where Vellum and Atticus look for Heading 1.

The dialog lists the manuscript and the publishing documents in binder order. Publishing includes the pages nested under Front Matter and Back Matter. Each row starts ticked if `includeInCompile` is set, which is the default for a scene and for a publishing page. The author can change the ticks for this export. The book is not modified unless they choose Remember, which writes the ticks back to `includeInCompile`. A file with only the synopsis ticked is a valid export. A file with nothing ticked writes nothing, and the export says so.

Order in the file:

1. Ticked Front Matter, in binder order. Each page starts on a new page. The binder title is not printed above the body.
2. Whatever of the manuscript is still ticked.
3. Ticked Back Matter, in binder order, each on a new page.
4. Any other ticked publishing page, such as Synopsis or Query, in binder order, each on a new page.

## How the file is built

Three pure steps, each testable without Tauri.

1. Choose. Ticked front matter, then the ticked manuscript, then ticked back matter, then any other ticked publishing page. A group with nothing ticked is skipped.
2. Fill. Walk the `EditorDoc` tree and replace variables. Collect every empty or unknown variable.
3. Shape. Apply the compile settings to a small document model: sections, paragraphs, runs, lists, header, footer, margins, and whether the first page is different.

A docx writer turns that model into a zip of Office XML. A small writer is enough: paragraphs, runs, lists, and section properties. Images, tables, footnotes, and comments are not in `EditorDoc`, so a general docx library would be weight without a job. novelWriter’s writer is the precedent for owning this subset.

The writer sets the document properties’ title and creator from `{$title}` and `{$author}`, so a later import into Vellum can see them.

Save uses the existing save dialog and the existing failure report. A failed write is a noticed error. A report of empty variables is a noticed error that still accompanies the file, because the author may want to see the holes. The notice lists the names.

## Defaults that match a submission

With the settings left alone, the manuscript is Times New Roman 12, double spaced, half-inch indent, one-inch margins, left aligned, header from the second page. Pages are not a division. The first folder level is included, and its heading is the folder’s title only, centered, at the top of a new page. Scenes are joined with a centered `#`, and their names are not printed. Publishing pages come out as written, each on its own page.

## Work, in order

1. Preferences and the variable filler, with tests for a filled value, an empty value, an unknown token, an address with line breaks, and `{$page}` rejected in the body.
2. Starter text for a new Title page, Copyright, and Query. A test that an existing publishing page is not replaced.
3. The Compile panes. Common, then Docx. The pass-through switch changes font and size only.
4. The document model and the docx writer. A test unzips the result and checks the paragraph text, a mark, the margin, and the header.
5. The export dialog, then the menu command. One file, containing exactly the ticked rows. The usual file is the manuscript plus the ticked publishing pages. A synopsis on its own is the same export with the other rows unticked.
