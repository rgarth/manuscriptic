import { MenuItem, PredefinedMenuItem, type Submenu } from "@tauri-apps/api/menu";
import { commands, onCommands } from "./commands";
import { sendMenuCommand } from "./menuCommand";

function commandItem(
  id: string,
  text: string,
  name: "new-scene" | "new-section" | "trash" | "find" | "find-next" | "find-previous" | "replace",
  accelerator?: string,
) {
  return MenuItem.new({
    id,
    text,
    accelerator,
    enabled: false,
    action: () => {
      sendMenuCommand({ name });
    },
  });
}

export async function installEditCommands(edit: Submenu): Promise<void> {
  const scene = await commandItem("edit-new-scene", "New Scene", "new-scene");
  const section = await commandItem("edit-new-section", "New Section", "new-section");
  const trash = await commandItem("edit-trash", "Move to Trash", "trash");
  const find = await commandItem("edit-find", "Find…", "find", "CmdOrCtrl+F");
  const findNext = await commandItem("edit-find-next", "Find Next", "find-next", "CmdOrCtrl+G");
  const findPrevious = await commandItem("edit-find-previous", "Find Previous", "find-previous", "CmdOrCtrl+Shift+G");
  const replace = await commandItem("edit-replace", "Replace…", "replace", "CmdOrCtrl+Alt+F");

  function sync() {
    if (!document.hasFocus()) {
      return;
    }
    const current = commands();
    const open = current.newScene !== null;
    const searching = current.find !== null;
    void scene.setEnabled(open);
    void scene.setText(current.leafLabel);
    void section.setEnabled(open);
    void trash.setEnabled(current.removal !== null);
    void trash.setText(current.removal?.label ?? "Move to Trash");
    void find.setEnabled(searching);
    void findNext.setEnabled(searching);
    void findPrevious.setEnabled(searching);
    void replace.setEnabled(searching);
  }

  onCommands(sync);
  sync();
  const separator = await PredefinedMenuItem.new({ item: "Separator" });
  await edit.prepend([scene, section, trash, separator]);
  await edit.insert(find, 4);
  await edit.insert(findNext, 5);
  await edit.insert(findPrevious, 6);
  await edit.insert(replace, 7);
}
