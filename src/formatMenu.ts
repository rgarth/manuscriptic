import { CheckMenuItem, MenuItem, Submenu } from "@tauri-apps/api/menu";
import { commands, onCommands } from "./commands";
import { sendMenuCommand } from "./menuCommand";
import { alignments } from "./pageLayout";
import { formatCommandsIn } from "./formatCommands";

export async function createFormatMenu(): Promise<Submenu> {
  const character = await menuItems("character");
  const lists = await menuItems("list");
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
    if (!document.hasFocus()) {
      return;
    }
    const current = commands();
    const enabled = current.format !== null;
    for (const item of commandsToEnable) {
      void item.setEnabled(enabled);
    }
    for (const [index, item] of alignments.entries()) {
      void alignItems[index]?.setChecked(item.id === current.align);
    }
  }

  onCommands(sync);
  sync();

  const alignMenu = await Submenu.new({ text: "Alignment", items: alignItems });
  return Submenu.new({
    text: "Format",
    items: [...character, { item: "Separator" }, ...lists, { item: "Separator" }, alignMenu],
  });
}

function menuItems(group: "character" | "list") {
  return Promise.all(
    formatCommandsIn(group).map(([command, spec]) =>
      MenuItem.new({
        id: `format-${command}`,
        text: spec.label,
        accelerator: spec.accelerator,
        enabled: false,
        action: () => {
          sendMenuCommand({ name: "format", command });
        },
      }),
    ),
  );
}
