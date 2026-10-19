import { invoke } from "@tauri-apps/api/core";

export function loadProject(): Promise<string | null> {
  return invoke<string | null>("load_project");
}

export function saveProject(contents: string, previous?: string): Promise<void> {
  return invoke("save_project", { contents, previous: previous ?? null });
}

export function listFonts(): Promise<string[]> {
  return invoke<string[]>("list_fonts");
}

export function documentsDirectory(): Promise<string> {
  return invoke<string>("documents_directory");
}

export function readNovelFile(path: string): Promise<string> {
  return invoke<string>("read_novel_file", { path });
}

export function writeNovelFile(path: string, contents: string, overwrite: boolean): Promise<void> {
  return invoke("write_novel_file", { path, contents, overwrite });
}
