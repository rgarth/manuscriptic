# Manuscriptic

Manuscriptic is a writing app for authors. Rich text lets you control headings, fonts, and style. Compile can override those editor settings to match a publisher's guide.

I use it for my own books. I run it on a Mac. Windows builds are on the releases page. Linux is untested.

![A book open in Manuscriptic](docs/screenshot.png)

## Download

The latest builds are on the [releases page](https://github.com/rgarth/manuscriptic/releases): the Apple Silicon disk image for a Mac, the ARM64 executable for a Windows ARM PC, or the x64 executable for an Intel or AMD Windows PC.

## Features

- A binder of sections and scenes. Drag them into place.
- Notes for characters, places, and research.
- Publishing pages: title, copyright, dedication, epigraph, synopsis, query, acknowledgements, about the author, and a back page.
- Rich text support.
- Typewriter mode keeps the cursor in the middle of the screen.
- Statistics. Word counts for the open scene and the whole manuscript. A clock tracks this sitting, the words written in it, and how long you have written today. It counts while the window is in front and the page has changed in the last five minutes.
- Inline spellchecker.
- Themes: Parchment, Chamomile, Rosewater, Bluebell, Sage, Ink, Midnight, Leather, and Typewriter.
- Export to a Word document (`.docx`) for a submission, another app, or a backup. Choose which pages go in, how chapters and scenes are headed, and the spacing and page numbers. Your author details can fill the title page.
- You can import a project from Scrivener.
- Snapshots. See Built-in backups.

The book is one file, and it saves itself while you work.

## Built-in backups

Snapshots are kept inside the book file.

A snapshot you take stays until you delete it. Automatic snapshots can be off, or every 5, 15, or 60 minutes. Automatic ones are kept in full for the last hour, then one an hour for the last day, then one a day for 30 days. Older automatic snapshots are dropped.

You can restore the whole book, or only the open scene.

## No support, no warranty

There is no support. There is no warranty.

I am not responsible if Manuscriptic shreds your next bestselling idea, or your lifetime opus. Keep your own copies of the work.

## Licence

[MIT](LICENSE).

## Building it

See [INSTALL.md](INSTALL.md).
