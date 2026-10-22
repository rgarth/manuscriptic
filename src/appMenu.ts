import { Menu, MenuItem, Submenu } from "@tauri-apps/api/menu";
import { commands, onCommands } from "./commands";
import { sendMenuCommand } from "./menuCommand";
import { installEditCommands } from "./editMenu";
import { createFormatMenu } from "./formatMenu";
import { createViewMenu } from "./viewMenu";

let installed: Menu | null = null;

export async function installAppMenu(): Promise<void> {
  const menu = await Menu.default();
  const newProject = {
    id: "new-project",
    text: "New Project…",
    accelerator: "CmdOrCtrl+N",
    action: () => {
      sendMenuCommand({ name: "new" });
    },
  };
  const openNovel = {
    id: "open-novel",
    text: "Open…",
    accelerator: "CmdOrCtrl+O",
    action: () => {
      sendMenuCommand({ name: "open" });
    },
  };
  const importScrivener = await MenuItem.new({
    id: "import-scrivener",
    text: "Import Scrivener…",
    action: () => {
      sendMenuCommand({ name: "import" });
    },
  });
  const saveNovel = await MenuItem.new({
    id: "save-novel",
    text: "Save",
    accelerator: "CmdOrCtrl+S",
    enabled: false,
    action: () => {
      sendMenuCommand({ name: "save" });
    },
  });
  const saveNovelAs = await MenuItem.new({
    id: "save-novel-as",
    text: "Save As…",
    accelerator: "CmdOrCtrl+Shift+S",
    enabled: false,
    action: () => {
      sendMenuCommand({ name: "save-as" });
    },
  });
  const takeSnapshot = await MenuItem.new({
    id: "take-snapshot",
    text: "Take Snapshot",
    enabled: false,
    action: () => {
      sendMenuCommand({ name: "snapshot" });
    },
  });
  const compileBook = await MenuItem.new({
    id: "compile-book",
    text: "Compile…",
    enabled: false,
    action: () => {
      sendMenuCommand({ name: "compile" });
    },
  });
  const compileSettings = await MenuItem.new({
    id: "compile-settings",
    text: "Compiler Settings…",
    enabled: false,
    action: () => {
      sendMenuCommand({ name: "compile-settings" });
    },
  });
  function syncFile() {
    if (!document.hasFocus()) {
      return;
    }
    const current = commands();
    void saveNovel.setEnabled(current.saveNovel !== null);
    void saveNovelAs.setEnabled(current.saveNovelAs !== null);
    void takeSnapshot.setEnabled(current.takeSnapshot !== null);
    void compileBook.setEnabled(current.compile !== null);
    void compileSettings.setEnabled(current.compileSettings !== null);
  }
  onCommands(syncFile);
  syncFile();
  const items = await menu.items();
  let fileMenu: Submenu | null = null;
  for (const item of items) {
    if (item instanceof Submenu && (await item.text()) === "File") {
      fileMenu = item;
      break;
    }
  }
  const settings = await MenuItem.new({
    id: "settings",
    text: "Settings…",
    accelerator: "CmdOrCtrl+,",
    action: () => {
      sendMenuCommand({ name: "settings" });
    },
  });
  if (fileMenu) {
    await fileMenu.prepend(newProject);
    await fileMenu.insert(openNovel, 1);
    await fileMenu.insert(importScrivener, 2);
    await fileMenu.insert(saveNovel, 3);
    await fileMenu.insert(saveNovelAs, 4);
    await fileMenu.insert(takeSnapshot, 5);
    await fileMenu.insert(compileBook, 6);
    await fileMenu.insert(compileSettings, 7);
    await fileMenu.insert(settings, 8);
  } else {
    const file = await Submenu.new({
      text: "File",
      items: [newProject, openNovel, importScrivener, saveNovel, saveNovelAs, takeSnapshot, compileBook, compileSettings, settings],
    });
    const afterAppMenu = navigator.userAgent.includes("Mac") ? 1 : 0;
    await menu.insert(file, afterAppMenu);
  }
  const itemsAfterFile = await menu.items();
  for (const item of itemsAfterFile) {
    if (item instanceof Submenu && (await item.text()) === "Edit") {
      await installEditCommands(item);
      break;
    }
  }
  await insertAfter(menu, "Edit", await createViewMenu());
  await insertAfter(menu, "View", await createFormatMenu());
  if (!document.hasFocus()) {
    await menu.close();
    return;
  }
  const previous = await menu.setAsAppMenu();
  await previous?.close();
  if (!navigator.userAgent.includes("Mac")) {
    await menu.setAsWindowMenu();
  }
  await installed?.close();
  installed = menu;
}

async function insertAfter(menu: Menu, after: string, item: Submenu) {
  const bar = await menu.items();
  let index = bar.length;
  for (let position = 0; position < bar.length; position += 1) {
    const entry = bar[position];
    if (entry instanceof Submenu && (await entry.text()) === after) {
      index = position + 1;
      break;
    }
  }
  await menu.insert(item, index);
}
