import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  getEditorPrefs,
  lineSpacings,
  paragraphIndents,
  setIndent,
  setSpacing,
  setTypewriter,
  subscribeEditorPrefs,
} from "./editorPrefs";
import { failureMessage, reportFailure } from "./failures";
import Hint from "./Hint";
import {
  preferenceDirectoryLabel,
  readFilePreferences,
  writeOpenLast,
  writeSaveDirectory,
} from "./filePrefs";
import { pickSaveDirectory, resolveDirectory } from "./novelFile";
import { applyTheme, onTheme, readTheme, readThemes } from "./themes";
import CompileSettings from "./CompileSettings";
import type { BookCompile } from "./model/project";

type SettingsSection = "files" | "appearance" | "writing" | "compile" | "dictionary";

type DictionarySettings = {
  words: string[];
  onAddWord: (word: string) => void;
  onRemoveWord: (word: string) => void;
};

type SettingsProps = {
  dictionary: DictionarySettings | null;
  book: { compile: BookCompile; onCompile: (compile: BookCompile) => void } | null;
  onClose: () => void;
};

export default function Settings({ dictionary, book, onClose }: SettingsProps) {
  const themes = readThemes();
  const stored = readFilePreferences(localStorage);
  const [section, setSection] = useState<SettingsSection>("files");
  const [theme, setTheme] = useState(() => readTheme(themes));
  const [directory, setDirectory] = useState(stored.directory);
  const [openLast, setOpenLast] = useState(stored.openLast);
  const typewriter = useSyncExternalStore(subscribeEditorPrefs, readTypewriter, readTypewriter);
  const indent = useSyncExternalStore(subscribeEditorPrefs, readIndent, readIndent);
  const spacing = useSyncExternalStore(subscribeEditorPrefs, readSpacing, readSpacing);
  const [draft, setDraft] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const shown: SettingsSection = section === "dictionary" && dictionary === null ? "files" : section;

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

  let pane: ReactNode;
  switch (shown) {
    case "files":
      pane = (
        <>
          <h3>Files</h3>
          <div className="setting">
            <span className="setting-label">Default file location</span>
            <p className="settings-value">{preferenceDirectoryLabel(directory)}</p>
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
        </>
      );
      break;
    case "appearance":
      pane = (
        <>
          <h3>Application Theme</h3>
          <ul className="theme-list" role="listbox" aria-label="Application Theme">
            {themes.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={item.id === theme}
                  onClick={() => applyTheme(item.id, themes)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      );
      break;
    case "writing":
      pane = (
        <>
          <h3>Writing</h3>
          <label className="preference">
            <input
              type="checkbox"
              checked={typewriter}
              onChange={(event) => setTypewriter(event.currentTarget.checked)}
            />
            <Hint label="Keeps the cursor in the middle of the screen.">Typewriter mode</Hint>
          </label>
          <div className="setting">
            <span className="setting-label">Paragraph indent</span>
            <div className="segmented" role="group" aria-label="Paragraph indent">
              {paragraphIndents.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={indent === item.id}
                  onClick={() => setIndent(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="setting">
            <span className="setting-label">Line spacing</span>
            <div className="segmented" role="group" aria-label="Line spacing">
              {lineSpacings.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={spacing === item.id}
                  onClick={() => setSpacing(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </>
      );
      break;
    case "compile":
      pane = <CompileSettings book={book} />;
      break;
    case "dictionary":
      pane = dictionary ? (
        <>
          <h3>Custom word list</h3>
          {dictionary.words.length > 0 ? (
            <ul className="word-list">
              {dictionary.words.map((word) => (
                <li key={word.toLocaleLowerCase()}>
                  <span>{word}</span>
                  <button type="button" onClick={() => dictionary.onRemoveWord(word)}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault();
              dictionary.onAddWord(draft);
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
        </>
      ) : null;
      break;
    default: {
      const unexpected: never = shown;
      pane = unexpected;
    }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog settings" role="dialog" aria-modal="true" aria-label="Settings">
        <header className="settings-bar">
          <h2>Settings</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav" aria-label="Settings sections">
            {navSections(dictionary !== null).map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={item.id === shown ? "page" : undefined}
                onClick={() => setSection(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <section className="settings-pane">{pane}</section>
        </div>
      </div>
    </div>
  );
}

function navSections(book: boolean): { id: SettingsSection; label: string }[] {
  const sections: { id: SettingsSection; label: string }[] = [
    { id: "files", label: "Files" },
    { id: "appearance", label: "Application Theme" },
    { id: "writing", label: "Writing" },
    { id: "compile", label: "Compile" },
  ];
  if (book) {
    sections.push({ id: "dictionary", label: "Dictionary" });
  }
  return sections;
}

function readTypewriter(): boolean {
  return getEditorPrefs().typewriter;
}

function readIndent() {
  return getEditorPrefs().indent;
}

function readSpacing() {
  return getEditorPrefs().spacing;
}
