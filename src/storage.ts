import { invoke } from "@tauri-apps/api/core";

export function loadProject(): Promise<string | null> {
  return invoke<string | null>("load_project");
}

export function saveProject(contents: string): Promise<void> {
  return invoke("save_project", { contents });
}
