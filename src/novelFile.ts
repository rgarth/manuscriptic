import { open, save } from "@tauri-apps/plugin-dialog";
import { joinNovelPath } from "./filePrefs.ts";
import { documentsDirectory } from "./storage.ts";

const novelFilter = [{ name: "Manuscriptic book", extensions: ["manuscriptic"] }];
const docxFilter = [{ name: "Word document", extensions: ["docx"] }];
const pdfFilter = [{ name: "PDF", extensions: ["pdf"] }];
const scrivenerFilter = [{ name: "Scrivener project", extensions: ["scriv", "scrivx"] }];

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

export async function pickScrivenerProject(directory: string): Promise<string | null> {
  const picked = await open({
    title: "Import Scrivener Project",
    defaultPath: directory,
    directory: false,
    multiple: false,
    filters: scrivenerFilter,
  });
  return typeof picked === "string" ? picked : null;
}

export async function pickNovelSaveAs(
  directory: string,
  fileName: string,
  title = "Save As",
): Promise<string | null> {
  return save({
    title,
    defaultPath: joinNovelPath(directory, fileName),
    filters: novelFilter,
  });
}

export async function pickExportSave(directory: string, fileName: string, kind: "docx" | "pdf"): Promise<string | null> {
  return save({
    title: "Compile",
    defaultPath: joinNovelPath(directory, fileName),
    filters: kind === "pdf" ? pdfFilter : docxFilter,
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

