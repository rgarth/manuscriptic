import { open, save } from "@tauri-apps/plugin-dialog";
import { joinNovelPath } from "./filePrefs.ts";
import { documentsDirectory } from "./storage.ts";

const novelFilter = [{ name: "Manuscriptic book", extensions: ["manuscriptic"] }];

export async function resolveDirectory(directory: string | null): Promise<string> {
  return directory ?? documentsDirectory();
}

export async function pickNovelToOpen(directory: string): Promise<string | null> {
  const picked = await open({
    title: "Open",
    defaultPath: directory,
    directory: false,
    multiple: false,
    filters: novelFilter,
  });
  return typeof picked === "string" ? picked : null;
}

export async function pickNovelSaveAs(directory: string, fileName: string): Promise<string | null> {
  return save({
    title: "Save As",
    defaultPath: joinNovelPath(directory, fileName),
    filters: novelFilter,
  });
}

export async function pickSaveDirectory(directory: string): Promise<string | null> {
  const picked = await open({
    title: "Save location",
    defaultPath: directory,
    directory: true,
    multiple: false,
  });
  return typeof picked === "string" ? picked : null;
}

