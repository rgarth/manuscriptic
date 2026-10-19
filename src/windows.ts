import { getAllWebviewWindows, WebviewWindow } from "@tauri-apps/api/webviewWindow";

export function bookQuery(): string | null {
  return new URLSearchParams(window.location.search).get("book");
}

export function tauriAvailable(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function openBookWindow(path: string, title: string): Promise<void> {
  const label = windowLabel(path);
  if (!tauriAvailable()) {
    window.open(`${window.location.pathname}?book=${encodeURIComponent(path)}`, label);
    return;
  }
  const existing = (await getAllWebviewWindows()).find((item) => item.label === label);
  if (existing) {
    await existing.setFocus();
    return;
  }
  const created = new WebviewWindow(label, {
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
