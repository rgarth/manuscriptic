export type FilePreferences = {
  directory: string | null;
  openLast: boolean;
  lastProject: string | null;
};

export type StartupChoice =
  | { kind: "file"; path: string }
  | { kind: "working-copy" }
  | { kind: "landing" };

export type SaveStep =
  | { kind: "write"; path: string }
  | { kind: "create"; directory: string | null; fileName: string }
  | { kind: "dialog"; directory: string | null; fileName: string };

type PrefStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

const directoryKey = "manuscriptic-save-directory";
const openLastKey = "manuscriptic-open-last";
const lastProjectKey = "manuscriptic-last-project";

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

export function novelFileName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return `${cleaned.length > 0 ? cleaned : "Untitled Novel"}.json`;
}

export function joinNovelPath(directory: string, fileName: string): string {
  const separator = directory.includes("\\") ? "\\" : "/";
  const base = directory.endsWith("/") || directory.endsWith("\\") ? directory.slice(0, -1) : directory;
  return `${base}${separator}${fileName}`;
}

export function startupChoice(prefs: FilePreferences, hasWorkingCopy: boolean): StartupChoice {
  if (!prefs.openLast) {
    return { kind: "landing" };
  }
  if (prefs.lastProject) {
    return { kind: "file", path: prefs.lastProject };
  }
  if (hasWorkingCopy) {
    return { kind: "working-copy" };
  }
  return { kind: "landing" };
}

export function startupAfterUnreadable(hasWorkingCopy: boolean): StartupChoice {
  if (hasWorkingCopy) {
    return { kind: "working-copy" };
  }
  return { kind: "landing" };
}

export function saveChoice(prefs: FilePreferences, filePath: string | null, title: string): SaveStep {
  const path = clean(filePath);
  if (path) {
    return { kind: "write", path };
  }
  return { kind: "create", directory: prefs.directory, fileName: novelFileName(title) };
}

export function saveAsChoice(prefs: FilePreferences, title: string): SaveStep {
  return { kind: "dialog", directory: prefs.directory, fileName: novelFileName(title) };
}

export function stepAfterOccupied(step: SaveStep): SaveStep {
  switch (step.kind) {
    case "create":
      return { kind: "dialog", directory: step.directory, fileName: step.fileName };
    case "write":
    case "dialog":
      return step;
    default: {
      const unexpected: never = step;
      return unexpected;
    }
  }
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
