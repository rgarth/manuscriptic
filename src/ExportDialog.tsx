import { useState } from "react";
import { resolvedCompilePreferences } from "./bookCompile.ts";
import { readCompileIdentity } from "./compilePrefs.ts";
import { initialCompileTicks } from "./compileTicks.ts";
import { compiledFile } from "./docx.ts";
import { reportFailure } from "./failures.ts";
import { bookFileName, readFilePreferences } from "./filePrefs.ts";
import type { ProjectFile } from "./model/project.ts";
import { pickDocxSave, resolveDirectory } from "./novelFile.ts";
import { writeExport } from "./storage.ts";

export default function ExportDialog({
  project,
  onClose,
}: {
  project: ProjectFile;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);

  async function compile() {
    let preferences;
    try {
      preferences = resolvedCompilePreferences(project.compile, readCompileIdentity(localStorage));
    } catch (error: unknown) {
      reportFailure(error, "Author information could not be read.");
      return;
    }
    const compiled = compiledFile(project, initialCompileTicks(project), preferences, new Date().getFullYear());
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
      reportFailure(error, "Could not write the compiled file.");
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
          <p>Pages ticked in Compiler Settings are written to a Word file (docx).</p>
          <div className="dialog-actions">
            <button type="button" onClick={() => void compile()} disabled={busy}>
              Compile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
