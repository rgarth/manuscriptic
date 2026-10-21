import { listen } from "@tauri-apps/api/event";
import { getAllWebviewWindows, getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useEffect, useRef, useState } from "react";
import { installAppMenu } from "./appMenu";
import { insertScene, insertSection } from "./binderActions";
import { commands, registerCommands } from "./commands";
import Desk, { Gate } from "./Desk";
import Settings from "./Settings";
import { booksOnStartup, markBookClosed, readSnapshotMinutes, type SnapshotMinutes } from "./filePrefs";
import { menuCommand, type MenuCommand } from "./menuCommand";
import { removal } from "./model/binder";
import { leafAction, setPageLayout } from "./model/project";
import { useBookFile } from "./useBookFile";
import { useNotice } from "./useNotice";
import { bookQuery, openBookWindow, tauriAvailable, windowClose } from "./windows";
import "./App.css";
import "./editor.css";

export default function App() {
  const [notice, showNotice] = useNotice();
  const [binderOpen, setBinderOpen] = useState(true);
  const [pendingTrash, setPendingTrash] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [snapshotsOpen, setSnapshotsOpen] = useState(false);
  const [snapshotMinutes, setSnapshotMinutes] = useState<SnapshotMinutes>(() =>
    readSnapshotMinutes(localStorage),
  );
  const runMenu = useRef<(command: MenuCommand) => void>(() => undefined);
  const dialogs = useRef({
    pendingTrash: null as string | null,
    settingsOpen: false,
    snapshotsOpen: false,
  });
  dialogs.current = { pendingTrash, settingsOpen, snapshotsOpen };

  const file = useBookFile(showNotice);
  const project = file.project;
  const selectedId = project?.view.selectedId ?? null;
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
    setSettingsOpen(false);
    setSnapshotsOpen(false);
    setPendingTrash(null);
  }, [project]);

  useEffect(() => {
    let cancelled = false;
    const startup = booksOnStartup(localStorage, bookQuery());
    const first = startup.paths[0];
    if (!first) {
      file.markReady();
      return;
    }
    file.loadBook(first)
      .then(async () => {
        if (cancelled || !startup.openRest) {
          return;
        }
        for (const path of startup.paths.slice(1)) {
          await openBookWindow(path, path);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          showNotice(error, "Could not open the project.");
          file.markReady();
        }
      });
    return () => {
      cancelled = true;
    };
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
        runMenu.current({ name: event.shiftKey ? "save-as" : "save" });
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
        if (dialogs.current.settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (dialogs.current.snapshotsOpen) {
          setSnapshotsOpen(false);
          return;
        }
        if (dialogs.current.pendingTrash) {
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
      case "save":
        void file.saveNovelFile(false);
        return;
      case "save-as":
        void file.saveNovelFile(true);
        return;
      case "snapshot":
        setSettingsOpen(false);
        setSnapshotsOpen(true);
        file.recordSnapshot("manual");
        return;
      case "settings":
        setSnapshotsOpen(false);
        setSettingsOpen(true);
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
      openNovel: () => runMenu.current({ name: "open" }),
      saveNovel: project ? () => runMenu.current({ name: "save" }) : null,
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

  const gateSettings = settingsOpen ? (
    <Settings dictionary={null} onClose={() => setSettingsOpen(false)} />
  ) : null;

  if (!project) {
    return (
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
    );
  }

  return (
    <Desk
      project={project}
      history={file.history}
      binderOpen={binderOpen}
      onBinderOpen={setBinderOpen}
      pendingTrash={pendingTrash}
      onAskTrash={(id) => askTrash(id)}
      onPendingTrash={setPendingTrash}
      settingsOpen={settingsOpen}
      onSettingsOpen={setSettingsOpen}
      snapshotsOpen={snapshotsOpen}
      onSnapshotsOpen={setSnapshotsOpen}
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
  );
}
