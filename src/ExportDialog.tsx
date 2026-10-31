import { useState } from "react";
import { firstPreset, resolvedCompilePreferences } from "./bookCompile.ts";
import { buildCompile, type CompileDocument } from "./compileShape.ts";
import { readCompileIdentity } from "./compilePrefs.ts";
import { compileDocx } from "./docx.ts";
import { reportFailure } from "./failures.ts";
import { bookFileName, readFilePreferences } from "./filePrefs.ts";
import type { ProjectFile } from "./model/project.ts";
import { pickExportSave, resolveDirectory } from "./novelFile.ts";
import { compilePdf } from "./pdf.ts";
import { writeExport } from "./storage.ts";

type ExportKind = "docx" | "pdf";

const formatOrder: ExportKind[] = ["docx", "pdf"];

const formats: {
  [Kind in ExportKind]: { label: string; extension: string; write: (doc: CompileDocument) => Uint8Array };
} = {
  docx: { label: "Word", extension: ".docx", write: compileDocx },
  pdf: { label: "PDF", extension: ".pdf", write: compilePdf },
};

export default function ExportDialog({
  project,
  onClose,
}: {
  project: ProjectFile;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [presetId, setPresetId] = useState(() => firstPreset(project.compile).id);
  const [kind, setKind] = useState<ExportKind>("docx");
  const preset = project.compile.presets.find((item) => item.id === presetId) ?? firstPreset(project.compile);
  const format = formats[kind];

  async function compile() {
    let preferences;
    try {
      preferences = resolvedCompilePreferences(project.compile, readCompileIdentity(localStorage), preset);
    } catch (error: unknown) {
      reportFailure(error, "Author information could not be read.");
      return;
    }
    const compiled = buildCompile(project, preset, preferences, new Date().getFullYear());
    if (!compiled.hasDocument) {
      reportFailure("Nothing is selected, so nothing was written.", "Nothing is selected, so nothing was written.");
      return;
    }
    const bytes = format.write(compiled);
    setBusy(true);
    try {
      const directory = await resolveDirectory(readFilePreferences(localStorage).directory);
      const fileName = bookFileName(project.title).replace(/\.manuscriptic$/i, format.extension);
      const path = await pickExportSave(directory, fileName, kind);
      if (!path) {
        return;
      }
      await writeExport(path, bytes);
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
          <p>{`${preset.name} is written as ${format.label}.`}</p>
          <div className="compile-choices">
            <div>
              <p className="compile-choice-label">Compile</p>
              <div className="compile-preset-list" role="listbox" aria-label="Compile">
                {project.compile.presets.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={item.id === preset.id}
                    onClick={() => setPresetId(item.id)}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="compile-choice-label">Format</p>
              <div className="compile-preset-list" role="listbox" aria-label="Format">
                {formatOrder.map((id) => (
                  <button key={id} type="button" role="option" aria-selected={id === kind} onClick={() => setKind(id)}>
                    {formats[id].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
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
