import { compileIdentity, defaultCompileIdentity, type CompileIdentity } from "./bookCompile.ts";

const storageKey = "manuscriptic-compile";

type PrefStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function readCompileIdentity(storage: PrefStorage): CompileIdentity {
  const raw = storage.getItem(storageKey);
  if (raw === null || raw.trim() === "") {
    return defaultCompileIdentity();
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Author information could not be read.");
  }
  if (!isRecord(value)) {
    throw new Error("Author information could not be read.");
  }
  return compileIdentity(value);
}

export function writeCompileIdentity(storage: PrefStorage, identity: CompileIdentity): void {
  storage.setItem(storageKey, JSON.stringify(compileIdentity(identity)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
