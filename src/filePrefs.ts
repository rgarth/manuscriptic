export type FilePreferences = {
  directory: string | null;
  openLast: boolean;
};

export type PrefStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const directoryKey = "manuscriptic-save-directory";
const openLastKey = "manuscriptic-open-last";
const recentBooksKey = "manuscriptic-recent-books";
const lastCompileKey = "manuscriptic-last-compile";
const snapshotMinutesKey = "manuscriptic-snapshot-minutes";
const recentLimit = 10;

export function readFilePreferences(storage: PrefStorage): FilePreferences {
  return {
    directory: clean(storage.getItem(directoryKey)),
    openLast: storage.getItem(openLastKey) !== "false",
  };
}

export function writeSaveDirectory(storage: PrefStorage, directory: string | null): void {
  store(storage, directoryKey, clean(directory));
}

export function writeOpenLast(storage: PrefStorage, openLast: boolean): void {
  storage.setItem(openLastKey, openLast ? "true" : "false");
}

export function preferenceDirectoryLabel(directory: string | null): string {
  return clean(directory) ?? "Documents";
}

export function booksOnStartup(storage: PrefStorage, requested: string | null): string | null {
  if (requested) {
    return requested;
  }
  if (!readFilePreferences(storage).openLast) {
    return null;
  }
  return readRecentBooks(storage)[0] ?? null;
}

export function readRecentBooks(storage: PrefStorage): string[] {
  const raw = storage.getItem(recentBooksKey);
  if (!raw) {
    return [];
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("The list of recent books could not be read.");
  }
  const books: string[] = [];
  for (const item of parsed) {
    if (typeof item !== "string") {
      continue;
    }
    const path = item.trim();
    if (!path || books.includes(path)) {
      continue;
    }
    books.push(path);
  }
  return books.slice(0, recentLimit);
}

export async function presentRecentBooks(
  storage: PrefStorage,
  exists: (path: string) => Promise<boolean>,
): Promise<string[]> {
  const books = readRecentBooks(storage);
  const checks = await Promise.all(books.map((path) => exists(path)));
  const kept = books.filter((_path, index) => checks[index]);
  if (kept.length !== books.length) {
    storage.setItem(recentBooksKey, JSON.stringify(kept));
  }
  return kept;
}

export function rememberRecentBook(storage: PrefStorage, path: string): void {
  const cleanPath = path.trim();
  if (!cleanPath) {
    return;
  }
  const books = readRecentBooks(storage).filter((item) => item !== cleanPath);
  books.unshift(cleanPath);
  storage.setItem(recentBooksKey, JSON.stringify(books.slice(0, recentLimit)));
}

export function recentMenuBooks(books: readonly string[], openPath: string | null): string[] {
  if (!openPath) {
    return [...books];
  }
  return books.filter((path) => path !== openPath);
}

export type CompileTarget = {
  presetId: string;
  kind: "docx" | "pdf";
};

export function readLastCompile(storage: PrefStorage, path: string | null): CompileTarget | null {
  const book = path?.trim() ?? "";
  if (!book) {
    return null;
  }
  const entry = compileTargets(storage)[book];
  if (!entry || entry.presetId.trim() === "") {
    return null;
  }
  return entry;
}

export function writeLastCompile(storage: PrefStorage, path: string | null, target: CompileTarget): void {
  const book = path?.trim() ?? "";
  if (!book || target.presetId.trim() === "") {
    return;
  }
  const targets = compileTargets(storage);
  targets[book] = { presetId: target.presetId, kind: target.kind };
  storage.setItem(lastCompileKey, JSON.stringify(targets));
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

export function folderFromBookPath(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (slash <= 0) {
    return "";
  }
  return path.slice(0, slash);
}

export function exportPath(path: string, extension: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const name = path.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? path.slice(0, slash + 1 + dot) : path;
  return `${stem}${extension}`;
}

export function joinNovelPath(directory: string, fileName: string): string {
  const separator = directory.includes("\\") ? "\\" : "/";
  const base = directory.endsWith("/") || directory.endsWith("\\") ? directory.slice(0, -1) : directory;
  return `${base}${separator}${fileName}`;
}

function compileTarget(value: unknown): CompileTarget | null {
  if (typeof value !== "object" || value === null || !("presetId" in value) || !("kind" in value)) {
    return null;
  }
  const presetId = value.presetId;
  const kind = value.kind;
  if (typeof presetId !== "string" || (kind !== "docx" && kind !== "pdf")) {
    return null;
  }
  return { presetId, kind };
}

function compileTargets(storage: PrefStorage): Record<string, CompileTarget> {
  const raw = storage.getItem(lastCompileKey);
  if (!raw) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const targets: Record<string, CompileTarget> = {};
  for (const [path, entry] of Object.entries(parsed)) {
    const target = compileTarget(entry);
    if (target) {
      targets[path] = target;
    }
  }
  return targets;
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
