import type { SceneCommand } from "./formatCommands";
import type { Removal } from "./model/binder";
import type { Alignment } from "./pageLayout";

export type CommandState = {
  newProject: (() => void) | null;
  openNovel: (() => void) | null;
  saveNovel: (() => void) | null;
  saveNovelAs: (() => void) | null;
  takeSnapshot: (() => void) | null;
  compile: (() => void) | null;
  bookSettings: (() => void) | null;
  newScene: (() => void) | null;
  newSection: (() => void) | null;
  trash: (() => void) | null;
  format: ((command: SceneCommand) => void) | null;
  removal: Removal | null;
  align: Alignment;
  leafLabel: string;
  openSettings: (() => void) | null;
};

const initial: CommandState = {
  newProject: null,
  openNovel: null,
  saveNovel: null,
  saveNovelAs: null,
  takeSnapshot: null,
  compile: null,
  bookSettings: null,
  newScene: null,
  newSection: null,
  trash: null,
  format: null,
  removal: null,
  align: "justify",
  leafLabel: "New Scene",
  openSettings: null,
};

let state: CommandState = { ...initial };
const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) {
    listener();
  }
}

export function commands(): CommandState {
  return state;
}

export function registerCommands(patch: Partial<CommandState>): () => void {
  const keys = Object.keys(patch) as (keyof CommandState)[];
  const previous = state;
  state = { ...state, ...patch };
  publish();
  return () => {
    let next = state;
    for (const key of keys) {
      if (next[key] === patch[key]) {
        next = restore(next, key, previous);
      }
    }
    state = next;
    publish();
  };
}

function restore<K extends keyof CommandState>(
  current: CommandState,
  key: K,
  previous: CommandState,
): CommandState {
  return { ...current, [key]: previous[key] };
}

export function onCommands(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
