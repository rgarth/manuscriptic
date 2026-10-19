export type FilePreferences = {
  directory: string | null;
  openLast: boolean;
  lastProject: string | null;
};

type PrefStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const directoryKey = "manuscriptic-save-directory";
const openLastKey = "manuscriptic-open-last";
const lastProjectKey = "manuscriptic-last-project";
const openBooksKey = "manuscriptic-open-books";
const liveBooksKey = "manuscriptic-live-books";
const snapshotMinutesKey = "manuscriptic-snapshot-minutes";

export function readFilePreferences(storage: PrefStorage): FilePreferences {
  return {
    directory: clean(storage.getItem(directoryKey)),
    openLast: storage.getItem(openLastKey) !== "false",
    lastProject: clean(storage.getItem(lastProjectKey)),
  };
}

export function writeSaveDirectory(storage: PrefStorage, directory: string | null): void {
  store(storage, directoryKey, clean(directory));
}

export function writeOpenLast(storage: PrefStorage, openLast: boolean): void {
  storage.setItem(openLastKey, openLast ? "true" : "false");
}

export function writeLastProject(storage: PrefStorage, path: string | null): void {
  store(storage, lastProjectKey, clean(path));
}

export function preferenceDirectoryLabel(directory: string | null): string {
  return clean(directory) ?? "Documents";
}

export function readOpenBooks(storage: PrefStorage): string[] {
  const raw = storage.getItem(openBooksKey);
  if (!raw) {
    const last = clean(storage.getItem(lastProjectKey));
    return last ? [last] : [];
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("The list of open books could not be read.");
  }
  return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function rememberOpenBook(storage: PrefStorage, path: string): void {
  const books = readOpenBooks(storage).filter((item) => item !== path);
  books.push(path);
  storage.setItem(openBooksKey, JSON.stringify(books));
}

export type StartupBooks = {
  paths: string[];
  openRest: boolean;
};

export function booksOnStartup(storage: PrefStorage, requested: string | null): StartupBooks {
  if (requested) {
    return { paths: [requested], openRest: false };
  }
  if (!readFilePreferences(storage).openLast) {
    return { paths: [], openRest: false };
  }
  return { paths: readOpenBooks(storage), openRest: true };
}

export function markBookClosed(storage: PrefStorage, path: string): void {
  const remaining = readOpenBooks(storage).filter((item) => item !== path);
  storage.setItem(liveBooksKey, JSON.stringify(remaining));
}

export function adoptLiveBooks(storage: PrefStorage, raw: string | null): void {
  if (!raw) {
    return;
  }
  storage.setItem(openBooksKey, raw);
}

export function applyBookStorage(storage: PrefStorage, key: string | null, value: string | null): void {
  if (key !== liveBooksKey) {
    return;
  }
  adoptLiveBooks(storage, value);
}

export const snapshotMinuteChoices = [0, 5, 15, 60] as const;

export type SnapshotMinutes = (typeof snapshotMinuteChoices)[number];

export function readSnapshotMinutes(storage: PrefStorage): SnapshotMinutes {
  const raw = storage.getItem(snapshotMinutesKey);
  const parsed = raw === null ? 15 : Number(raw);
  switch (parsed) {
    case 0:
    case 5:
    case 15:
    case 60:
      return parsed;
    default:
      return 15;
  }
}

export function writeSnapshotMinutes(storage: PrefStorage, minutes: SnapshotMinutes): void {
  storage.setItem(snapshotMinutesKey, String(minutes));
}

export function bookFileName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return `${cleaned.length > 0 ? cleaned : "Untitled Novel"}.manuscriptic`;
}

export function titleFromBookPath(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(slash + 1).replace(/\.manuscriptic$/i, "").trim();
}

export function joinNovelPath(directory: string, fileName: string): string {
  const separator = directory.includes("\\") ? "\\" : "/";
  const base = directory.endsWith("/") || directory.endsWith("\\") ? directory.slice(0, -1) : directory;
  return `${base}${separator}${fileName}`;
}

function clean(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function store(storage: PrefStorage, key: string, value: string | null): void {
  if (value) {
    storage.setItem(key, value);
    return;
  }
  storage.removeItem(key);
}
