import { useState } from "react";
import { withTitleOnly } from "./bookCompile.ts";
import {
  collapsedCompileFolders,
  compileRows,
  initialCompileTicks,
  rememberCompile,
  shownCompileRows,
  toggleCompileRow,
} from "./compileTicks.ts";
import Icon from "./icons.tsx";
import { setBookCompile, type ProjectFile } from "./model/project.ts";

export default function BookContents({
  project,
  onProject,
}: {
  project: ProjectFile;
  onProject: (update: (project: ProjectFile) => ProjectFile) => void;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => collapsedCompileFolders(compileRows(project)));
  const included = initialCompileTicks(project);
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

  return (
    <>
      <h3>Contents</h3>
      <p className="settings-value">
        Ticked pages are compiled. An unnumbered folder keeps its title and stays out of the count.
      </p>
      <div className="contents-rows" role="group" aria-label="Included pages">
        {rows.map((row) => {
          const open = row.kind === "folder" && !collapsed.has(row.id);
          return (
            <div key={row.id} className="contents-row" style={{ paddingLeft: `${row.depth * 1.1}rem` }}>
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
                  onChange={() =>
                    onProject((current) => rememberCompile(current, toggleCompileRow(current, initialCompileTicks(current), row.id)))
                  }
                />
                <span>{row.title}</span>
              </label>
              {row.numbering ? (
                <select
                  aria-label={`${row.title} heading`}
                  value={project.compile.titleOnly.includes(row.id) ? "unnumbered" : "default"}
                  onChange={(event) => {
                    const choice = headingChoice(event.currentTarget.value);
                    if (!choice) {
                      return;
                    }
                    onProject((current) =>
                      setBookCompile(current, withTitleOnly(current.compile, row.id, choice === "unnumbered")),
                    );
                  }}
                >
                  <option value="default">Default</option>
                  <option value="unnumbered">Unnumbered</option>
                </select>
              ) : null}
            </div>
          );
        })}
      </div>
    </>
  );
}

function headingChoice(value: string): "default" | "unnumbered" | null {
  switch (value) {
    case "default":
    case "unnumbered":
      return value;
    default:
      return null;
  }
}
