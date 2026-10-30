import { MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { commands } from "./commands";
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

export async function editCommandItems(): Promise<{ items: Array<MenuItem | PredefinedMenuItem>; sync: () => void }> {
  const scene = await commandItem("edit-new-scene", "New Scene", "new-scene");
  const section = await commandItem("edit-new-section", "New Section", "new-section");
  const trash = await commandItem("edit-trash", "Move to Trash", "trash");
  const find = await commandItem("edit-find", "Find…", "find", "CmdOrCtrl+F");
  const findNext = await commandItem("edit-find-next", "Find Next", "find-next", "CmdOrCtrl+G");
  const findPrevious = await commandItem("edit-find-previous", "Find Previous", "find-previous", "CmdOrCtrl+Shift+G");
  const replace = await commandItem("edit-replace", "Replace…", "replace", "CmdOrCtrl+Alt+F");

  function sync() {
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

  const separator = await PredefinedMenuItem.new({ item: "Separator" });
  return { items: [scene, section, trash, separator, find, findNext, findPrevious, replace], sync };
}
