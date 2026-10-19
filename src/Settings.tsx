import { useEffect, useState, useSyncExternalStore } from "react";
import { getEditorPrefs, setTypewriter, subscribeEditorPrefs } from "./editorPrefs";
import { failureMessage, reportFailure } from "./failures";
import {
  preferenceDirectoryLabel,
  readFilePreferences,
  snapshotMinuteChoices,
  writeOpenLast,
  writeSaveDirectory,
  writeSnapshotMinutes,
  type SnapshotMinutes,
} from "./filePrefs";
import { pickSaveDirectory, resolveDirectory } from "./novelFile";
import { applyTheme, onTheme, readTheme, readThemes } from "./themes";

export type SnapshotListItem = {
  id: string;
  at: number;
  kind: "manual" | "auto";
};

type SettingsProps = {
  words: string[];
  onAddWord: (word: string) => void;
  onRemoveWord: (word: string) => void;
  onClose: () => void;
  snapshotMinutes: SnapshotMinutes;
  snapshots: SnapshotListItem[];
  onSnapshotMinutes: (minutes: SnapshotMinutes) => void;
  onTakeSnapshot: () => void;
  onRestoreBook: (id: string) => void;
  onRestoreScene: (id: string) => void;
  onDeleteSnapshot: (id: string) => void;
};

export default function Settings({
  words,
  onAddWord,
  onRemoveWord,
  onClose,
  snapshotMinutes,
  snapshots,
  onSnapshotMinutes,
  onTakeSnapshot,
  onRestoreBook,
  onRestoreScene,
  onDeleteSnapshot,
}: SettingsProps) {
  const themes = readThemes();
  const stored = readFilePreferences(localStorage);
  const [theme, setTheme] = useState(() => readTheme(themes));
  const [directory, setDirectory] = useState(stored.directory);
  const [openLast, setOpenLast] = useState(stored.openLast);
  const typewriter = useSyncExternalStore(subscribeEditorPrefs, readTypewriter, readTypewriter);
  const [draft, setDraft] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);

  function savePreference(write: () => void): boolean {
    try {
      write();
      setFolderError(null);
      return true;
    } catch (error: unknown) {
      const message = failureMessage(error, "Could not save this preference.");
      setFolderError(message);
      reportFailure(message, message);
      return false;
    }
  }

  async function chooseFolder() {
    setFolderError(null);
    try {
      const picked = await pickSaveDirectory(await resolveDirectory(directory));
      if (!picked) {
        return;
      }
      if (!savePreference(() => writeSaveDirectory(localStorage, picked))) {
        return;
      }
      setDirectory(readFilePreferences(localStorage).directory);
    } catch (error: unknown) {
      const message = failureMessage(error, "Could not choose a folder.");
      setFolderError(message);
      reportFailure(message, message);
    }
  }

  useEffect(() => onTheme(setTheme), []);

  return (
    <div className="dialog-backdrop">
      <div className="dialog settings" role="dialog" aria-modal="true" aria-label="Settings">
        <h2>Files</h2>
        <p>Open and Save As start in this folder. Save writes the novel’s own file.</p>
        <p>{preferenceDirectoryLabel(directory)}</p>
        {folderError ? <p role="alert">{folderError}</p> : null}
        <div className="row">
          <button
            type="button"
            onClick={() => {
              void chooseFolder();
            }}
          >
            Choose folder
          </button>
          <button
            type="button"
            disabled={directory === null}
            onClick={() => {
              if (savePreference(() => writeSaveDirectory(localStorage, null))) {
                setDirectory(null);
              }
            }}
          >
            Use Documents
          </button>
        </div>
        <label className="preference">
          <input
            type="checkbox"
            checked={openLast}
            onChange={(event) => {
              const next = event.currentTarget.checked;
              if (savePreference(() => writeOpenLast(localStorage, next))) {
                setOpenLast(next);
              }
            }}
          />
          Open last project on start
        </label>
        <h2>Theme</h2>
        <ul className="choice-list">
          {themes.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-pressed={item.id === theme}
                onClick={() => applyTheme(item.id)}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
        <h2>Writing</h2>
        <label className="preference">
          <input
            type="checkbox"
            checked={typewriter}
            onChange={(event) => setTypewriter(event.currentTarget.checked)}
          />
          Keep the cursor in the middle of the screen
        </label>
        <h2>Project dictionary</h2>
        <p>Words here are spelled correctly in this novel. The list is saved with the book.</p>
        {words.length === 0 ? (
          <p>No extra words yet. Right-click a word in the text to add it.</p>
        ) : (
          <ul className="word-list">
            {words.map((word) => (
              <li key={word.toLocaleLowerCase()}>
                <span>{word}</span>
                <button type="button" onClick={() => onRemoveWord(word)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          className="row"
          onSubmit={(event) => {
            event.preventDefault();
            onAddWord(draft);
            setDraft("");
          }}
        >
          <input
            aria-label="Add a word"
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
          <button type="submit">Add</button>
        </form>
        <h2>Snapshots</h2>
        <p>A snapshot is a diff of what changed. Older automatic ones thin out. A manual one stays until you delete it.</p>
        <label className="preference">
          Keep an automatic snapshot
          <select
            aria-label="Automatic snapshot interval"
            value={String(snapshotMinutes)}
            onChange={(event) => {
              const minutes = snapshotMinute(event.currentTarget.value);
              if (savePreference(() => writeSnapshotMinutes(localStorage, minutes))) {
                onSnapshotMinutes(minutes);
              }
            }}
          >
            {snapshotMinuteChoices.map((minutes) => (
              <option key={minutes} value={minutes}>
                {snapshotLabel(minutes)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onTakeSnapshot}>
          Take snapshot
        </button>
        {snapshots.length === 0 ? (
          <p>No snapshots yet.</p>
        ) : (
          <ul className="word-list">
            {snapshots.map((snapshot) => (
              <li key={snapshot.id}>
                <span>
                  {new Date(snapshot.at).toLocaleString()} · {snapshot.kind === "manual" ? "Manual" : "Automatic"}
                </span>
                <button type="button" onClick={() => onRestoreScene(snapshot.id)}>
                  Scene
                </button>
                <button type="button" onClick={() => onRestoreBook(snapshot.id)}>
                  Book
                </button>
                <button type="button" onClick={() => onDeleteSnapshot(snapshot.id)}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function readTypewriter(): boolean {
  return getEditorPrefs().typewriter;
}

function snapshotLabel(minutes: SnapshotMinutes): string {
  switch (minutes) {
    case 0:
      return "Off";
    case 5:
      return "Every 5 minutes";
    case 15:
      return "Every 15 minutes";
    case 60:
      return "Every hour";
    default: {
      const unexpected: never = minutes;
      return unexpected;
    }
  }
}

function snapshotMinute(value: string): SnapshotMinutes {
  switch (value) {
    case "0":
      return 0;
    case "5":
      return 5;
    case "15":
      return 15;
    case "60":
      return 60;
    default:
      return 15;
  }
}
