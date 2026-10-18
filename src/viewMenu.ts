import { CheckMenuItem, MenuItem, Submenu } from "@tauri-apps/api/menu";
import {
  getEditorPrefs,
  nextZoom,
  setZoom,
  subscribeEditorPrefs,
  zoomStops,
} from "./editorPrefs";

export async function createViewMenu(): Promise<Submenu> {
  const zoomIn = await MenuItem.new({
    id: "view-zoom-in",
    text: "Zoom In",
    accelerator: "CmdOrCtrl+Plus",
    action: () => {
      setZoom(nextZoom(getEditorPrefs().zoom, "in"));
    },
  });
  const zoomOut = await MenuItem.new({
    id: "view-zoom-out",
    text: "Zoom Out",
    accelerator: "CmdOrCtrl+Minus",
    action: () => {
      setZoom(nextZoom(getEditorPrefs().zoom, "out"));
    },
  });
  const actual = await MenuItem.new({
    id: "view-actual-size",
    text: "Actual Size",
    accelerator: "CmdOrCtrl+0",
    action: () => {
      setZoom(100);
    },
  });
  const stops = await Promise.all(
    zoomStops.map((stop) =>
      CheckMenuItem.new({
        id: `view-zoom-${stop}`,
        text: zoomLabel(stop),
        checked: stop === getEditorPrefs().zoom,
        action: () => {
          setZoom(stop);
        },
      }),
    ),
  );

  function sync() {
    const zoom = getEditorPrefs().zoom;
    for (const [index, stop] of zoomStops.entries()) {
      void stops[index]?.setChecked(stop === zoom);
    }
  }

  subscribeEditorPrefs(sync);
  return Submenu.new({
    text: "View",
    items: [zoomIn, zoomOut, actual, { item: "Separator" }, ...stops],
  });
}

function zoomLabel(stop: number): string {
  return Number.isInteger(stop) ? `${stop}%` : `${stop.toFixed(1)}%`;
}
