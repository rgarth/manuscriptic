import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { raiseBookWindow } from "./storage.ts";

export function bookQuery(): string | null {
  return new URLSearchParams(window.location.search).get("book");
}

export function clearBookQuery(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("book")) {
    return;
  }
  url.searchParams.delete("book");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

export function tauriAvailable(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export function windowClose(hasBook: boolean, windowCount: number): "leave" | "destroy" {
  if (hasBook && windowCount <= 1) {
    return "leave";
  }
  return "destroy";
}

export async function openBookWindow(path: string, title: string): Promise<void> {
  if (!tauriAvailable()) {
    window.open(`${window.location.pathname}?book=${encodeURIComponent(path)}`, windowLabel(path));
    return;
  }
  if (await raiseBookWindow(path)) {
    return;
  }
  const created = new WebviewWindow(`book-${crypto.randomUUID()}`, {
    url: `index.html?book=${encodeURIComponent(path)}`,
    title,
    width: 1100,
    height: 760,
    minWidth: 840,
    minHeight: 560,
    dragDropEnabled: false,
  });
  await new Promise<void>((resolve, reject) => {
    void created.once("tauri://created", () => resolve());
    void created.once("tauri://error", (event) => {
      reject(event.payload instanceof Error ? event.payload : new Error("Could not open a window."));
    });
  });
}

function windowLabel(path: string): string {
  let hash = 2166136261;
  for (const char of path) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return `book-${(hash >>> 0).toString(16)}`;
}
