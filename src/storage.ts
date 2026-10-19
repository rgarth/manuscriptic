import { invoke } from "@tauri-apps/api/core";

export function listFonts(): Promise<string[]> {
  return invoke<string[]>("list_fonts");
}

export function documentsDirectory(): Promise<string> {
  return invoke<string>("documents_directory");
}

export function readBook(path: string): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("read_book", { path });
}

export function writeBook(
  path: string,
  files: Record<string, string>,
  overwrite: boolean,
): Promise<void> {
  return invoke("write_book", { path, files, overwrite });
}
