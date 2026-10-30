import { CheckMenuItem, MenuItem, Submenu } from "@tauri-apps/api/menu";
import { commands } from "./commands";
import { sendMenuCommand } from "./menuCommand";
import { alignments } from "./pageLayout";
import { formatCommandsIn, type SceneCommand } from "./formatCommands";

type FormatChord = "strike" | "subscript";

export async function createFormatMenu(overrides?: Record<FormatChord, string>): Promise<{ menu: Submenu; sync: () => void }> {
  const character = await menuItems("character", overrides);
  const lists = await menuItems("list", overrides);
  const alignItems = await Promise.all(
    alignments.map((item) =>
      CheckMenuItem.new({
        id: `align-${item.id}`,
        text: item.label,
        checked: item.id === commands().align,
        enabled: false,
        action: () => {
          sendMenuCommand({ name: "align", align: item.id });
        },
      }),
    ),
  );
  const commandsToEnable = [...character, ...lists, ...alignItems];

  function sync() {
    const current = commands();
    const enabled = current.format !== null;
    for (const item of commandsToEnable) {
      void item.setEnabled(enabled);
    }
    for (const [index, item] of alignments.entries()) {
      void alignItems[index]?.setChecked(item.id === current.align);
    }
  }

  const alignMenu = await Submenu.new({ text: "Alignment", items: alignItems });
  const menu = await Submenu.new({
    text: "Format",
    items: [...character, { item: "Separator" }, ...lists, { item: "Separator" }, alignMenu],
  });
  return { menu, sync };
}

function formatAccelerator(
  command: SceneCommand,
  accelerator: string | undefined,
  overrides?: Record<FormatChord, string>,
): string | undefined {
  if (overrides && (command === "strike" || command === "subscript")) {
    return overrides[command];
  }
  return accelerator;
}

function menuItems(group: "character" | "list", overrides?: Record<FormatChord, string>) {
  return Promise.all(
    formatCommandsIn(group).map(([command, spec]) =>
      MenuItem.new({
        id: `format-${command}`,
        text: spec.label,
        accelerator: formatAccelerator(command, spec.accelerator, overrides),
        enabled: false,
        action: () => {
          sendMenuCommand({ name: "format", command });
        },
      }),
    ),
  );
}
