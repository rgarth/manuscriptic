import { emit } from "@tauri-apps/api/event";
import type { SceneCommand } from "./formatCommands.ts";
import { alignments, type Alignment } from "./pageLayout.ts";

const sceneCommands = {
  bold: true,
  italic: true,
  underline: true,
  strike: true,
  superscript: true,
  subscript: true,
  bullet: true,
  numbered: true,
  outdent: true,
  indent: true,
} satisfies Record<SceneCommand, true>;

export type MenuCommand =
  | { name: "new" }
  | { name: "open" }
  | { name: "open-recent"; path: string }
  | { name: "import" }
  | { name: "save-as" }
  | { name: "snapshot" }
  | { name: "compile" }
  | { name: "book-settings" }
  | { name: "settings" }
  | { name: "new-scene" }
  | { name: "new-section" }
  | { name: "trash" }
  | { name: "find" }
  | { name: "find-next" }
  | { name: "find-previous" }
  | { name: "replace" }
  | { name: "undo" }
  | { name: "redo" }
  | { name: "format"; command: SceneCommand }
  | { name: "align"; align: Alignment };

export function sendMenuCommand(command: MenuCommand): void {
  void emit("manuscriptic-command", command);
}

export function menuCommand(value: unknown): MenuCommand | null {
  if (!isRecord(value) || typeof value.name !== "string") {
    return null;
  }
  switch (value.name) {
    case "new":
    case "open":
    case "import":
    case "save-as":
    case "snapshot":
    case "compile":
    case "book-settings":
    case "settings":
    case "new-scene":
    case "new-section":
    case "trash":
    case "find":
    case "find-next":
    case "find-previous":
    case "replace":
    case "undo":
    case "redo":
      return { name: value.name };
    case "open-recent":
      return recentCommand(value.path);
    case "format":
      return sceneCommand(value.command);
    case "align":
      return alignCommand(value.align);
    default:
      return null;
  }
}

function recentCommand(value: unknown): MenuCommand | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  return { name: "open-recent", path: value };
}

function alignCommand(value: unknown): MenuCommand | null {
  if (typeof value !== "string") {
    return null;
  }
  for (const item of alignments) {
    if (item.id === value) {
      return { name: "align", align: item.id };
    }
  }
  return null;
}

function sceneCommand(value: unknown): MenuCommand | null {
  if (typeof value !== "string") {
    return null;
  }
  for (const command of Object.keys(sceneCommands) as (keyof typeof sceneCommands)[]) {
    if (command === value) {
      return { name: "format", command };
    }
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
