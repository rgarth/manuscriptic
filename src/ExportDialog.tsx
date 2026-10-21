import { useState } from "react";
import { bookFileName, readFilePreferences } from "./filePrefs.ts";
import { readCompilePreferences } from "./compilePrefs.ts";
import { compileRows, initialCompileTicks, rememberCompile, toggleCompileRow } from "./compileTicks.ts";
import { compiledFile } from "./docx.ts";
import { failureMessage, reportFailure } from "./failures.ts";
import { pickDocxSave, resolveDirectory } from "./novelFile.ts";
import type { ProjectFile } from "./model/project.ts";
import { writeExport } from "./storage.ts";

export default function ExportDialog({
  project,
  onRemember,
  onClose,
}: {
  project: ProjectFile;
  onRemember: (project: ProjectFile) => void;
  onClose: () => void;
}) {
  const [included, setIncluded] = useState(() => initialCompileTicks(project));
  const [busy, setBusy] = useState(false);
  const rows = compileRows(project);

  async function compile() {
    let preferences;
    try {
      preferences = readCompilePreferences(localStorage);
    } catch (error: unknown) {
      reportFailure(error, "Compile settings could not be read.");
      return;
    }
    const compiled = compiledFile(project, included, preferences, new Date().getFullYear());
    switch (compiled.kind) {
      case "empty":
        reportFailure("Nothing is selected, so nothing was written.", "Nothing is selected, so nothing was written.");
        return;
      case "docx":
        break;
      default: {
        const unexpected: never = compiled;
        return unexpected;
      }
    }
    setBusy(true);
    try {
      const directory = await resolveDirectory(readFilePreferences(localStorage).directory);
      const fileName = bookFileName(project.title).replace(/\.manuscriptic$/i, ".docx");
      const path = await pickDocxSave(directory, fileName);
      if (!path) {
        return;
      }
      await writeExport(path, compiled.bytes);
      if (compiled.missing.length > 0) {
        const names = compiled.missing.join(", ");
        reportFailure(`Left blank: ${names}.`, `Left blank: ${names}.`);
      }
      onClose();
    } catch (error: unknown) {
      reportFailure(error, failureMessage(error, "Could not write the compiled file."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <div className="dialog compile" role="dialog" aria-modal="true" aria-label="Compile">
        <header className="settings-bar">
          <h2>Compile</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="compile-body">
          <p>One Word file. Tick what goes in it.</p>
          <div className="compile-rows" role="group" aria-label="Included pages">
            {rows.map((row) => (
              <label key={row.id} style={{ paddingLeft: `${row.depth * 1.1}rem` }}>
                <input
                  type="checkbox"
                  checked={included.has(row.id)}
                  onChange={() => setIncluded((current) => toggleCompileRow(project, current, row.id))}
                />
                {row.title}
              </label>
            ))}
          </div>
          <div className="dialog-actions">
            <button type="button" onClick={() => onRemember(rememberCompile(project, included))} disabled={busy}>
              Remember
            </button>
            <button type="button" onClick={() => void compile()} disabled={busy}>
              Compile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
