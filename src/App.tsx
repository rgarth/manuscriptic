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
import { removal } from "./model/binder";
import { leafAction, setPageLayout } from "./model/project";
import { useBookFile } from "./useBookFile";
import { useNotice } from "./useNotice";
import { raiseBookWindow, restoreOpenedBooks, takeOpenedBooks } from "./storage";
import { bookQuery, claimStartupBooks, openBookWindow, tauriAvailable, windowClose } from "./windows";
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
    let stop = () => {};
    void (async () => {
      try {
        const requested = bookQuery();
        const fromFinder = requested ? [] : await claimStartupBooks();
        if (cancelled) {
          return;
        }
        const startup = booksOnStartup(localStorage, requested ?? fromFinder[0] ?? null);
        const first = startup.paths[0];
        const rest = [
          ...(startup.openRest ? startup.paths.slice(1) : []),
          ...fromFinder.filter((path) => path !== first),
        ];
        if (first) {
          preloadSceneEditor();
          await file.loadBook(first);
        } else {
          file.markReady();
        }
        if (cancelled) {
          await giveBack(rest);
          return;
        }
        for (let index = 0; index < rest.length; index += 1) {
          if (cancelled) {
            await giveBack(rest.slice(index));
            return;
          }
          await openBookWindow(rest[index], rest[index]);
        }
        if (!tauriAvailable() || cancelled) {
          return;
        }
        const unlisten = await listen("opened-books", () => {
          void openHeldBooks();
        });
        if (cancelled) {
          unlisten();
          return;
        }
        stop = unlisten;
        await openHeldBooks();
      } catch (error: unknown) {
        if (!cancelled) {
          showNotice(error, "Could not open the project.");
          file.markReady();
        }
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };

    async function giveBack(paths: string[]) {
      if (paths.length === 0) {
        return;
      }
      await restoreOpenedBooks(paths).catch((error: unknown) => {
        showNotice(error, "Could not open the project.");
      });
    }

    async function openHeldBooks() {
      const paths = await takeOpenedBooks();
      for (let index = 0; index < paths.length; index += 1) {
        if (cancelled) {
          await giveBack(paths.slice(index));
          return;
        }
        const path = paths[index];
        try {
          if (file.hasBook()) {
            await openBookWindow(path, path);
          } else if (!(await raiseBookWindow(path))) {
            await file.loadBook(path);
          }
        } catch (error: unknown) {
          showNotice(error, "Could not open the project.");
        }
      }
    }
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setBinderOpen((value) => !value);
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        runMenu.current({ name: "open" });
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (event.shiftKey) {
          runMenu.current({ name: "save-as" });
        }
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault();
        runMenu.current({ name: "settings" });
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        runMenu.current({ name: "new" });
        return;
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
