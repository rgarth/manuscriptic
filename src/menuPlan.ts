export type KeyState = {
  key: string;
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  alt: boolean;
};

export type PageKey = { name: "binder" } | { name: "open" } | { name: "save-as" } | { name: "ignore" } | { name: "settings" } | { name: "new" };

export type FindKey = "find" | "replace" | "find-next" | "find-previous";

export function pageKey(state: KeyState): PageKey | null {
  const command = state.ctrl || state.meta;
  const key = state.key.toLowerCase();
  if (command && state.shift && key === "f") {
    return { name: "binder" };
  }
  if (command && key === "o") {
    return { name: "open" };
  }
  if (command && key === "s") {
    return state.shift ? { name: "save-as" } : { name: "ignore" };
  }
  if (command && !state.alt && !state.shift && state.key === ",") {
    return { name: "settings" };
  }
  if (command && key === "n") {
    return { name: "new" };
  }
  return null;
}

export function findKey(state: KeyState): FindKey | null {
  const command = state.ctrl || state.meta;
  if (!command) {
    return null;
  }
  const key = state.key.toLowerCase();
  if (key === "f" && !state.shift) {
    return state.alt ? "replace" : "find";
  }
  if (key === "g") {
    return state.shift ? "find-previous" : "find-next";
  }
  return null;
}
