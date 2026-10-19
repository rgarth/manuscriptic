import { MenuItem, PredefinedMenuItem, type Submenu } from "@tauri-apps/api/menu";
import { commands, onCommands } from "./commands";
import { sendMenuCommand } from "./menuCommand";

export async function installEditCommands(edit: Submenu): Promise<void> {
  const scene = await MenuItem.new({
    id: "edit-new-scene",
    text: "New Scene",
    enabled: false,
    action: () => {
      sendMenuCommand({ name: "new-scene" });
    },
  });
  const section = await MenuItem.new({
    id: "edit-new-section",
    text: "New Section",
    enabled: false,
    action: () => {
      sendMenuCommand({ name: "new-section" });
    },
  });
  const trash = await MenuItem.new({
    id: "edit-trash",
    text: "Move to Trash",
    enabled: false,
    action: () => {
      sendMenuCommand({ name: "trash" });
    },
  });

  function sync() {
    if (!document.hasFocus()) {
      return;
    }
    const current = commands();
    const open = current.newScene !== null;
    void scene.setEnabled(open);
    void scene.setText(current.leafLabel);
    void section.setEnabled(open);
    void trash.setEnabled(current.removal !== null);
    void trash.setText(current.removal?.label ?? "Move to Trash");
  }

  onCommands(sync);
  sync();
  const separator = await PredefinedMenuItem.new({ item: "Separator" });
  await edit.prepend([scene, section, trash, separator]);
}
