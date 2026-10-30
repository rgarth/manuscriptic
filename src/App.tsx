import { listen } from "@tauri-apps/api/event";
import { getAllWebviewWindows, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useRef, useState } from "react";
import { installAppMenu } from "./appMenu";
import { insertScene, insertSection } from "./binderActions";
import { commands, registerCommands } from "./commands";
import Desk, { Gate, preloadSceneEditor, type DeskDialog } from "./Desk";
import Settings from "./Settings";
import { booksOnStartup, markBookClosed, readSnapshotMinutes, type SnapshotMinutes } from "./filePrefs";
import { menuCommand, type MenuCommand } from "./menuCommand";
import { pageKey } from "./menuPlan";
import { removal } from "./model/binder";
import { leafAction, setPageLayout } from "./model/project";
import { launchBooks } from "./storage";
import { useBookFile } from "./useBookFile";
import { useNotice } from "./useNotice";
import { bookQuery, openBookWindow, tauriAvailable, windowClose } from "./windows";
import "./App.css";
import "./editor.css";

export default function App() {
  const [notice, showNotice] = useNotice();
  const [binderOpen, setBinderOpen] = useState(true);
  const [pendingTrash, setPendingTrash] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DeskDialog | null>(null);
  const [snapshotMinutes, setSnapshotMinutes] = useState<SnapshotMinutes>(() =>
    readSnapshotMinutes(localStorage),
  );
  const runMenu = useRef<(command: MenuCommand) => void>(() => undefined);
  const open = useRef({ dialog: null as DeskDialog | null, pendingTrash: null as string | null });
  open.current = { dialog, pendingTrash };

  const file = useBookFile(showNotice);
  const project = file.project;
  const selectedId = project?.view.selectedId ?? null;

  useEffect(() => {
    if (!tauriAvailable()) {
      return;
    }
    const name = project?.title.trim() ?? "";
    const title = name ? `Manuscriptic - ${name}` : "Manuscriptic";
    void getCurrentWebviewWindow().setTitle(title).catch((error: unknown) => {
      showNotice(error, "Could not retitle the window.");
    });
  }, [project?.title, showNotice]);
  const hadBook = useRef(false);

  useEffect(() => {
    if (project) {
      hadBook.current = true;
      return;
    }
    if (!hadBook.current) {
      return;
    }
    hadBook.current = false;
    setDialog(null);
    setPendingTrash(null);
  }, [project]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const query = bookQuery();
        const launched = query || !tauriAvailable() ? [] : await launchBooks();
        if (cancelled) {
          return;
        }
        const paths = launched.length > 0 ? launched : booksOnStartup(localStorage, query).paths;
        const first = paths[0];
        if (!first) {
          file.markReady();
          return;
        }
        preloadSceneEditor();
        await file.loadBook(first);
        if (cancelled) {
          return;
        }
        for (const path of paths.slice(1)) {
          await openBookWindow(path, path);
        }
      } catch (error: unknown) {
        if (!cancelled) {
          showNotice(error, "Could not open the project.");
          file.markReady();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const hit = pageKey({
        key: event.key,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        shift: event.shiftKey,
        alt: event.altKey,
      });
      if (hit) {
        event.preventDefault();
        switch (hit.name) {
          case "binder":
            setBinderOpen((value) => !value);
            return;
          case "ignore":
            return;
          case "open":
          case "save-as":
          case "settings":
          case "new":
            runMenu.current({ name: hit.name });
            return;
          default: {
            const unexpected: never = hit;
            return unexpected;
          }
        }
      }
      if (event.key === "Escape") {
        if (open.current.dialog) {
          setDialog(null);
          return;
        }
        if (open.current.pendingTrash) {
          setPendingTrash(null);
          return;
        }
        setBinderOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    function onBlur() {
      file.onWindowBlur();
    }
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, []);

  useEffect(() => {
    if (!tauriAvailable()) {
      return;
    }
    let stop = () => {};
    let cancelled = false;
    void getCurrentWebviewWindow()
      .onCloseRequested(async (event) => {
        event.preventDefault();
        const openWindows = (await getAllWebviewWindows()).length;
        if (windowClose(file.hasBook(), openWindows) === "leave") {
          await file.leaveBook();
          return;
        }
        await getCurrentWebviewWindow().destroy();
      })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
          return;
        }
        stop = unlisten;
      })
      .catch((error: unknown) => {
        showNotice(error, "Could not watch the window closing.");
      });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  function askTrash(id: string | null) {
    if (!project || !id || !removal(project, id)) {
      return;
    }
    setPendingTrash(id);
  }

  function runMenuCommand(command: MenuCommand) {
    switch (command.name) {
      case "new":
        void file.createBook();
        return;
      case "open":
        void file.openNovelFile();
        return;
      case "import":
        void file.importScrivener();
        return;
      case "save-as":
        void file.saveNovelFile();
        return;
      case "snapshot":
        setDialog("snapshots");
        file.recordSnapshot("manual");
        return;
      case "compile":
        if (!project) {
          return;
        }
        setDialog("compile");
        return;
      case "book-settings":
        if (!project) {
          return;
        }
        setDialog("book-settings");
        return;
      case "settings":
        setDialog("settings");
        return;
      case "new-scene":
        file.setProject((current) => (current ? insertScene(current, current.view.selectedId) : current));
        return;
      case "new-section":
        file.setProject((current) => (current ? insertSection(current, current.view.selectedId) : current));
        return;
      case "trash":
        askTrash(project?.view.selectedId ?? null);
        return;
      case "find":
        commands().find?.();
        return;
      case "find-next":
        commands().findNext?.();
        return;
      case "find-previous":
        commands().findPrevious?.();
        return;
      case "replace":
        commands().replace?.();
        return;
      case "undo":
        commands().undo?.();
        return;
      case "redo":
        commands().redo?.();
        return;
      case "format":
        commands().format?.(command.command);
        return;
      case "align":
        file.setProject((current) =>
          current ? setPageLayout(current, { ...current.layout, align: command.align }) : current,
        );
        return;
      default: {
        const unexpected: never = command;
        return unexpected;
      }
    }
  }
  runMenu.current = runMenuCommand;

  useEffect(() => {
    return registerCommands({
      openSettings: () => runMenu.current({ name: "settings" }),
      newProject: () => runMenu.current({ name: "new" }),
      takeSnapshot: project ? () => runMenu.current({ name: "snapshot" }) : null,
      compile: project ? () => runMenu.current({ name: "compile" }) : null,
      bookSettings: project ? () => runMenu.current({ name: "book-settings" }) : null,
      openNovel: () => runMenu.current({ name: "open" }),
      saveNovelAs: project ? () => runMenu.current({ name: "save-as" }) : null,
      newScene: project ? () => runMenu.current({ name: "new-scene" }) : null,
      newSection: project ? () => runMenu.current({ name: "new-section" }) : null,
      trash: project ? () => runMenu.current({ name: "trash" }) : null,
      removal: project && selectedId ? removal(project, selectedId) : null,
      align: project?.layout.align ?? "justify",
      leafLabel: project ? leafAction(project, selectedId).menuLabel : "New Scene",
    });
  }, [project, selectedId]);

  useEffect(() => {
    void installAppMenu().catch((error: unknown) => {
      showNotice(error, "Could not install the menu.");
    });
  }, []);

  useEffect(() => {
    if (!tauriAvailable()) {
      return;
    }
    function onFocus() {
      void installAppMenu().catch((error: unknown) => {
        showNotice(error, "Could not install the menu.");
      });
      file.onWindowFocus();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [showNotice]);

  useEffect(() => {
    if (!tauriAvailable()) {
      return;
    }
    let unlisten: (() => void) | undefined;
    void listen("manuscriptic-command", (event) => {
      const command = menuCommand(event.payload);
      if (!command || !document.hasFocus()) {
        return;
      }
      runMenu.current(command);
    }).then((stop) => {
      unlisten = stop;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!snapshotMinutes || !project) {
      return;
    }
    const timer = window.setInterval(() => {
      file.recordSnapshot("auto");
    }, snapshotMinutes * 60 * 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [snapshotMinutes, project]);

  useEffect(() => {
    if (!file.filePath) {
      return;
    }
    const path = file.filePath;
    function onHide() {
      try {
        markBookClosed(localStorage, path);
      } catch (error: unknown) {
        showNotice(error, "Could not update the list of open books.");
      }
    }
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
    };
  }, [file.filePath]);

  const gateSettings = dialog === "settings" ? (
    <Settings onClose={() => setDialog(null)} />
  ) : null;
  const importMatter = file.answerImportMatter ? (
    <ImportMatterDialog onAnswer={file.answerImportMatter} />
  ) : null;

  if (!project) {
    return (
      <>
        <Gate
          notice={notice}
          ready={file.ready}
          settings={gateSettings}
          onOpen={() => {
            void file.openNovelFile();
          }}
          onCreate={() => {
            void file.createBook();
          }}
          onImport={() => {
            void file.importScrivener();
          }}
        />
        {importMatter}
      </>
    );
  }

  return (
    <>
      <Desk
      project={project}
      history={file.history}
      binderOpen={binderOpen}
      onBinderOpen={setBinderOpen}
      pendingTrash={pendingTrash}
      onAskTrash={(id) => askTrash(id)}
      onPendingTrash={setPendingTrash}
      dialog={dialog}
      onDialog={setDialog}
      filePath={file.filePath}
      notice={notice}
      saveState={file.saveState}
      saveError={file.saveError}
      snapshotMinutes={snapshotMinutes}
      onSnapshotMinutes={setSnapshotMinutes}
      onProject={(update) => file.setProject((current) => (current ? update(current) : current))}
      onTakeSnapshot={() => file.recordSnapshot("manual")}
      onRestoreBook={file.restoreSnapshotBook}
      onRestoreScene={file.restoreSnapshotScene}
      onDeleteSnapshot={file.removeSnapshot}
    />
      {importMatter}
    </>
  );
}

function ImportMatterDialog({ onAnswer }: { onAnswer: (keep: boolean | null) => void }) {
  const [keep, setKeep] = useState(true);
  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Import Scrivener">
        <p>The Title page and the other starter pages stay beside the imported ones. Choose which pages compile in Contents.</p>
        <label className="preference">
          <input
            type="checkbox"
            checked={keep}
            onChange={(event) => setKeep(event.currentTarget.checked)}
          />
          Create Manuscriptic front and back matter
        </label>
        <div className="dialog-actions">
          <button type="button" onClick={() => onAnswer(keep)}>
            Import
          </button>
          <button type="button" onClick={() => onAnswer(null)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
