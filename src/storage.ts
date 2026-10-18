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
