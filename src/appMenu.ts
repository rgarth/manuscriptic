import { getCurrentWindow } from "@tauri-apps/api/window";
import { Menu, MenuItem, Submenu } from "@tauri-apps/api/menu";
import { commands, onCommands } from "./commands";
import { editCommandItems } from "./editMenu";
import { createFormatMenu } from "./formatMenu";
import { sendMenuCommand } from "./menuCommand";
import { createViewMenu } from "./viewMenu";

let installed: Menu | null = null;
let field: HTMLInputElement | HTMLTextAreaElement | null = null;
let watching = false;

export async function installAppMenu(): Promise<void> {
  if (navigator.userAgent.includes("Windows")) {
    await installWindowsMenu();
    return;
  }
  await installMacMenu();
}

async function installMacMenu(): Promise<void> {
  const menu = await Menu.default();
  const file = await fileCommandItems("Cmd+Option+,");
  const edit = await editCommandItems();
  const format = await createFormatMenu();
  followFocus(file.sync);
  followFocus(edit.sync);
  followFocus(format.sync);
  const bar = await menu.items();
  let fileMenu: Submenu | null = null;
  for (const item of bar) {
    if (item instanceof Submenu && (await item.text()) === "File") {
      fileMenu = item;
      break;
    }
  }
  if (fileMenu) {
    await fileMenu.insert(file.items, 0);
  } else {
    const submenu = await Submenu.new({ text: "File", items: file.items });
    const afterAppMenu = navigator.userAgent.includes("Mac") ? 1 : 0;
    await menu.insert(submenu, afterAppMenu);
  }
  const itemsAfterFile = await menu.items();
  for (const item of itemsAfterFile) {
    if (item instanceof Submenu && (await item.text()) === "Edit") {
      await item.insert(edit.items, 0);
      break;
    }
  }
  await insertAfter(menu, "Edit", await createViewMenu());
  await insertAfter(menu, "View", format.menu);
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

async function installWindowsMenu(): Promise<void> {
  rememberTextField();
  const file = await fileCommandItems("Ctrl+Alt+,");
  const edit = await editCommandItems();
  const format = await createFormatMenu({ strike: "CmdOrCtrl+Shift+X", subscript: "CmdOrCtrl+Shift+," });
  keepUpdated(file.sync);
  keepUpdated(edit.sync);
  keepUpdated(format.sync);
  const menu = await Menu.new({
    items: [
      await Submenu.new({
        text: "File",
        items: [...file.items, { item: "Separator" }, { item: "CloseWindow" }, { item: "Quit" }],
      }),
      await Submenu.new({
        text: "Edit",
        items: [
          ...edit.items,
          await historyItem("undo"),
          await historyItem("redo"),
          { item: "Separator" },
          { item: "Cut" },
          { item: "Copy" },
          { item: "Paste" },
          { item: "SelectAll" },
        ],
      }),
      await createViewMenu(),
      format.menu,
      await Submenu.new({
        text: "Window",
        items: [{ item: "Minimize" }, { item: "Maximize" }, { item: "Separator" }, { item: "CloseWindow" }],
      }),
      await Submenu.new({
        text: "Help",
        items: [{ item: { About: null } }],
      }),
    ],
  });
  const previous = await menu.setAsWindowMenu(getCurrentWindow());
  await previous?.close();
  if (installed && installed !== previous) {
    await installed.close();
  }
  installed = menu;
}

async function fileCommandItems(bookSettingsAccelerator: string): Promise<{ items: MenuItem[]; sync: () => void }> {
  const newProject = await MenuItem.new({
    id: "new-project",
    text: "New Project…",
    accelerator: "CmdOrCtrl+N",
    action: () => {
      sendMenuCommand({ name: "new" });
    },
  });
  const openNovel = await MenuItem.new({
    id: "open-novel",
    text: "Open…",
    accelerator: "CmdOrCtrl+O",
    action: () => {
      sendMenuCommand({ name: "open" });
    },
  });
  const importScrivener = await MenuItem.new({
    id: "import-scrivener",
    text: "Import Scrivener…",
    action: () => {
      sendMenuCommand({ name: "import" });
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
  const bookSettings = await MenuItem.new({
    id: "book-settings",
    text: "Book Settings…",
    accelerator: bookSettingsAccelerator,
    enabled: false,
    action: () => {
      sendMenuCommand({ name: "book-settings" });
    },
  });
  const settings = await MenuItem.new({
    id: "settings",
    text: "Settings…",
    accelerator: "CmdOrCtrl+,",
    action: () => {
      sendMenuCommand({ name: "settings" });
    },
  });

  function sync() {
    const current = commands();
    void saveNovelAs.setEnabled(current.saveNovelAs !== null);
    void takeSnapshot.setEnabled(current.takeSnapshot !== null);
    void compileBook.setEnabled(current.compile !== null);
    void bookSettings.setEnabled(current.bookSettings !== null);
  }

  return { items: [newProject, openNovel, importScrivener, saveNovelAs, takeSnapshot, compileBook, bookSettings, settings], sync };
}

function followFocus(sync: () => void) {
  function run() {
    if (!document.hasFocus()) {
      return;
    }
    sync();
  }
  onCommands(run);
  run();
}

function keepUpdated(sync: () => void) {
  onCommands(sync);
  sync();
}

function historyItem(kind: "undo" | "redo") {
  return MenuItem.new({
    id: `edit-${kind}`,
    text: kind === "undo" ? "Undo" : "Redo",
    accelerator: kind === "undo" ? "CmdOrCtrl+Z" : "CmdOrCtrl+Y",
    action: () => {
      const target = field;
      if (target && target.isConnected) {
        target.focus();
        document.execCommand(kind);
        return;
      }
      sendMenuCommand({ name: kind });
    },
  });
}

function rememberTextField() {
  if (watching) {
    return;
  }
  watching = true;
  window.addEventListener("focusin", () => {
    const active = document.activeElement;
    field = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
  });
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
