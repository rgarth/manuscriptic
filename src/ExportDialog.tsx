import { useState } from "react";
import { bookFileName, readFilePreferences } from "./filePrefs.ts";
import { resolvedCompilePreferences } from "./bookCompile.ts";
import { readCompileIdentity } from "./compilePrefs.ts";
import {
  collapsedCompileFolders,
  compileRows,
  initialCompileTicks,
  rememberCompile,
  shownCompileRows,
  toggleCompileRow,
} from "./compileTicks.ts";
import Icon from "./icons.tsx";
import { compiledFile } from "./docx.ts";
import { reportFailure } from "./failures.ts";
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
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => collapsedCompileFolders(compileRows(project)));
  const [busy, setBusy] = useState(false);
  const rows = shownCompileRows(compileRows(project), collapsed);

  function toggleFolder(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(id)) {
        next.add(id);
      }
      return next;
    });
  }

  async function compile() {
    let preferences;
    try {
      preferences = resolvedCompilePreferences(project.compile, readCompileIdentity(localStorage));
    } catch (error: unknown) {
      reportFailure(error, "Author information could not be read.");
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
          <p>Selected pages will be compiled into a Word file (docx).</p>
          <div className="compile-rows" role="group" aria-label="Included pages">
            {rows.map((row) => {
              const open = row.kind === "folder" && !collapsed.has(row.id);
              return (
                <div key={row.id} className="compile-row" style={{ paddingLeft: `${row.depth * 1.1}rem` }}>
                  {row.kind === "folder" ? (
                    <button
                      type="button"
                      className={open ? "disclosure open" : "disclosure"}
                      aria-expanded={open}
                      aria-label={open ? `Collapse ${row.title}` : `Expand ${row.title}`}
                      onClick={() => toggleFolder(row.id)}
                    >
                      <Icon name="chevron" />
                    </button>
                  ) : (
                    <span className="disclosure-gap" />
                  )}
                  <label>
                    <input
                      type="checkbox"
                      checked={included.has(row.id)}
                      onChange={() => setIncluded((current) => toggleCompileRow(project, current, row.id))}
                    />
                    <span>{row.title}</span>
                  </label>
                </div>
              );
            })}
          </div>
          <div className="dialog-actions">
            <button type="button" onClick={() => onRemember(rememberCompile(project, included))} disabled={busy}>
              Save Selection
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
