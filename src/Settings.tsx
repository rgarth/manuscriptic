import { useEffect, useState } from "react";
import { failureMessage, reportFailure } from "./failures";
import {
  preferenceDirectoryLabel,
  readFilePreferences,
  writeOpenLast,
  writeSaveDirectory,
} from "./filePrefs";
import { pickSaveDirectory, resolveDirectory } from "./novelFile";
import { applyTheme, onTheme, readTheme, readThemes } from "./themes";

type SettingsProps = {
  words: string[];
  onAddWord: (word: string) => void;
  onRemoveWord: (word: string) => void;
  onClose: () => void;
};

export default function Settings({ words, onAddWord, onRemoveWord, onClose }: SettingsProps) {
  const themes = readThemes();
  const stored = readFilePreferences(localStorage);
  const [theme, setTheme] = useState(() => readTheme(themes));
  const [directory, setDirectory] = useState(stored.directory);
  const [openLast, setOpenLast] = useState(stored.openLast);
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
        <p>Dated snapshots are not set up yet. When they are, the timing will be chosen here.</p>
        <div className="row">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
