import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bookFileName,
  titleFromBookPath,
  booksOnStartup,
  joinNovelPath,
  folderFromBookPath,
  markBookClosed,
  preferenceDirectoryLabel,
  readFilePreferences,
  presentRecentBooks,
  readRecentBooks,
  recentMenuBooks,
  rememberBook,
  rememberOpenBook,
  rememberRecentBook,
  writeLastProject,
  writeOpenLast,
  writeSaveDirectory,
} from "./filePrefs.ts";
import { loadRecentBooks } from "./windows.ts";

type Memory = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function memory(initial: Record<string, string> = {}): Memory {
  const values = { ...initial };
  return {
    getItem(key) {
      return values[key] ?? null;
    },
    setItem(key, value) {
      values[key] = value;
    },
    removeItem(key) {
      delete values[key];
    },
  };
}

test("an unset preference means Documents, and startup opens nothing until a book is remembered", () => {
  const storage = memory();
  const prefs = readFilePreferences(storage);
  assert.equal(prefs.directory, null);
  assert.equal(prefs.openLast, true);
  assert.equal(prefs.lastProject, null);
  assert.equal(preferenceDirectoryLabel(prefs.directory), "Documents");
  assert.deepEqual(booksOnStartup(storage, null), { paths: [], openRest: true });
});

test("a blank or missing folder is Documents, and only an explicit false skips the last books", () => {
  const blank = readFilePreferences(
    memory({
      "manuscriptic-save-directory": "   ",
      "manuscriptic-open-last": "true",
      "manuscriptic-last-project": "  ",
    }),
  );
  assert.equal(blank.directory, null);
  assert.equal(blank.openLast, true);
  assert.equal(blank.lastProject, null);
  const storage = memory({ "manuscriptic-open-last": "false" });
  assert.equal(readFilePreferences(storage).openLast, false);
  assert.deepEqual(booksOnStartup(storage, null), { paths: [], openRest: false });
});

test("the chosen folder is where open and save as start", () => {
  const storage = memory();
  writeSaveDirectory(storage, "  /Users/me/Novels  ");
  const prefs = readFilePreferences(storage);
  assert.equal(prefs.directory, "/Users/me/Novels");
  assert.equal(preferenceDirectoryLabel(prefs.directory), "/Users/me/Novels");
  writeSaveDirectory(storage, null);
  assert.equal(readFilePreferences(storage).directory, null);
});

test("a path joins the folder and the book file", () => {
  assert.equal(
    joinNovelPath("/Users/me/Novels", "Untitled Novel.manuscriptic"),
    "/Users/me/Novels/Untitled Novel.manuscriptic",
  );
  assert.equal(joinNovelPath("C:\\Users\\me\\Documents\\", "Castus.manuscriptic"), "C:\\Users\\me\\Documents\\Castus.manuscriptic");
});

test("a file name keeps the title and drops characters a folder cannot hold", () => {
  assert.equal(bookFileName("Castus"), "Castus.manuscriptic");
  assert.equal(bookFileName("  "), "Untitled Novel.manuscriptic");
  assert.equal(bookFileName("Act/One: Dawn"), "Act One Dawn.manuscriptic");
  assert.equal(titleFromBookPath("/Users/me/Novels/Act One Dawn.manuscriptic"), "Act One Dawn");
  assert.equal(titleFromBookPath("C:\\Users\\me\\Documents\\Castus.manuscriptic"), "Castus");
});

test("startup opens the requested book alone, or every remembered book", () => {
  const storage = memory();
  writeLastProject(storage, "/Users/me/Novels/Castus.manuscriptic");
  assert.deepEqual(booksOnStartup(storage, null), {
    paths: ["/Users/me/Novels/Castus.manuscriptic"],
    openRest: true,
  });
  assert.deepEqual(booksOnStartup(storage, "/Volumes/Stick/Other.manuscriptic"), {
    paths: ["/Volumes/Stick/Other.manuscriptic"],
    openRest: false,
  });
  writeOpenLast(storage, false);
  assert.deepEqual(booksOnStartup(storage, null), { paths: [], openRest: false });
});

test("closing one book leaves the others for the next launch", () => {
  const storage = memory();
  rememberOpenBook(storage, "/Users/me/Novels/Castus.manuscriptic");
  rememberOpenBook(storage, "/Users/me/Novels/Harbor.manuscriptic");
  markBookClosed(storage, "/Users/me/Novels/Harbor.manuscriptic");
  assert.deepEqual(booksOnStartup(storage, null), {
    paths: ["/Users/me/Novels/Castus.manuscriptic"],
    openRest: true,
  });
});

test("closing the last book leaves the landing page for the next launch", () => {
  const storage = memory();
  rememberOpenBook(storage, "/Users/me/Novels/Castus.manuscriptic");
  markBookClosed(storage, "/Users/me/Novels/Castus.manuscriptic");
  assert.deepEqual(booksOnStartup(storage, null), { paths: [], openRest: true });
});

test("remembering a book records it as open and recent, and closing leaves it recent", () => {
  const storage = memory();
  rememberBook(storage, "/Users/me/Novels/Castus.manuscriptic");
  assert.deepEqual(booksOnStartup(storage, null).paths, ["/Users/me/Novels/Castus.manuscriptic"]);
  assert.deepEqual(readRecentBooks(storage), ["/Users/me/Novels/Castus.manuscriptic"]);
  markBookClosed(storage, "/Users/me/Novels/Castus.manuscriptic");
  assert.deepEqual(booksOnStartup(storage, null).paths, []);
  assert.deepEqual(readRecentBooks(storage), ["/Users/me/Novels/Castus.manuscriptic"]);
});

test("the open book is left out of that window's recent menu", () => {
  const books = ["/Users/me/Novels/Castus.manuscriptic", "/Users/me/Novels/Bone Eaters.manuscriptic"];
  assert.deepEqual(recentMenuBooks(books, "/Users/me/Novels/Castus.manuscriptic"), [
    "/Users/me/Novels/Bone Eaters.manuscriptic",
  ]);
  assert.deepEqual(recentMenuBooks(books, null), books);
});

test("recent books keep the last ten paths, and a missing file is dropped", async () => {
  const storage = memory();
  for (let index = 0; index < 12; index += 1) {
    rememberRecentBook(storage, `/Users/me/Novels/Book ${index}.manuscriptic`);
  }
  assert.deepEqual(
    readRecentBooks(storage),
    [11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((index) => `/Users/me/Novels/Book ${index}.manuscriptic`),
  );
  rememberRecentBook(storage, "/Users/me/Novels/Book 2.manuscriptic");
  assert.equal(readRecentBooks(storage)[0], "/Users/me/Novels/Book 2.manuscriptic");
  assert.equal(readRecentBooks(storage).length, 10);
  markBookClosed(storage, "/Users/me/Novels/Book 2.manuscriptic");
  assert.equal(readRecentBooks(storage)[0], "/Users/me/Novels/Book 2.manuscriptic");
  assert.equal(folderFromBookPath("/Users/me/Novels/Book 2.manuscriptic"), "/Users/me/Novels");
  const shown = await presentRecentBooks(storage, async (path) => path !== "/Users/me/Novels/Book 2.manuscriptic");
  assert.deepEqual(
    shown,
    [11, 10, 9, 8, 7, 6, 5, 4, 3].map((index) => `/Users/me/Novels/Book ${index}.manuscriptic`),
  );
  assert.deepEqual(readRecentBooks(storage), shown);
  assert.deepEqual(await loadRecentBooks(storage), shown);
});
