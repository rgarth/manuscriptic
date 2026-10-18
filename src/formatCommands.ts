import type { ChainedCommands } from "@tiptap/core";
import type { IconName } from "./icons";

type FormatSpec = {
  label: string;
  accelerator?: string;
  icon: IconName;
  active?: string;
  group: "character" | "list";
  apply: (chain: ChainedCommands) => void;
};

export const formatCommands = {
  bold: {
    label: "Bold",
    accelerator: "CmdOrCtrl+B",
    icon: "bold",
    active: "bold",
    group: "character",
    apply: (chain) => {
      chain.toggleBold().run();
    },
  },
  italic: {
    label: "Italic",
    accelerator: "CmdOrCtrl+I",
    icon: "italic",
    active: "italic",
    group: "character",
    apply: (chain) => {
      chain.toggleItalic().run();
    },
  },
  underline: {
    label: "Underline",
    accelerator: "CmdOrCtrl+U",
    icon: "underline",
    active: "underline",
    group: "character",
    apply: (chain) => {
      chain.toggleUnderline().run();
    },
  },
  strike: {
    label: "Strikethrough",
    accelerator: "CmdOrCtrl+Shift+S",
    icon: "strike",
    active: "strike",
    group: "character",
    apply: (chain) => {
      chain.toggleStrike().run();
    },
  },
  superscript: {
    label: "Superscript",
    accelerator: "CmdOrCtrl+.",
    icon: "superscript",
    active: "superscript",
    group: "character",
    apply: (chain) => {
      chain.toggleSuperscript().run();
    },
  },
  subscript: {
    label: "Subscript",
    accelerator: "CmdOrCtrl+,",
    icon: "subscript",
    active: "subscript",
    group: "character",
    apply: (chain) => {
      chain.toggleSubscript().run();
    },
  },
  bullet: {
    label: "Bulleted List",
    accelerator: "CmdOrCtrl+Shift+8",
    icon: "bullet",
    active: "bulletList",
    group: "list",
    apply: (chain) => {
      chain.toggleBulletList().run();
    },
  },
  numbered: {
    label: "Numbered List",
    accelerator: "CmdOrCtrl+Shift+7",
    icon: "numbered",
    active: "orderedList",
    group: "list",
    apply: (chain) => {
      chain.toggleOrderedList().run();
    },
  },
  outdent: {
    label: "Decrease Indent",
    icon: "outdent",
    group: "list",
    apply: (chain) => {
      chain.liftListItem("listItem").run();
    },
  },
  indent: {
    label: "Increase Indent",
    icon: "indent",
    group: "list",
    apply: (chain) => {
      chain.sinkListItem("listItem").run();
    },
  },
} satisfies Record<string, FormatSpec>;

export type SceneCommand = keyof typeof formatCommands;

export function formatCommandsIn(group: FormatSpec["group"]): [SceneCommand, FormatSpec][] {
  return (Object.keys(formatCommands) as SceneCommand[])
    .filter((command) => formatCommands[command].group === group)
    .map((command) => [command, formatCommands[command]]);
}
