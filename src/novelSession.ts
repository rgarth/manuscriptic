import { failureMessage } from "./failures.ts";
import {
  joinNovelPath,
  startupAfterUnreadable,
  startupChoice,
  stepAfterOccupied,
  type FilePreferences,
  type SaveStep,
} from "./filePrefs.ts";
import { parseProject, type ProjectFile } from "./model/project.ts";

export type StartedNovel = {
  project: ProjectFile | null;
  path: string | null;
  notice: string | null;
};

export type NovelFiles = {
  directory(preferred: string | null): Promise<string>;
  pickSave(directory: string, fileName: string): Promise<string | null>;
  write(path: string, contents: string, overwrite: boolean): Promise<void>;
};

export async function openAtStartup(
  prefs: FilePreferences,
  workingCopy: string | null,
  readFile: (path: string) => Promise<string>,
): Promise<StartedNovel> {
  const choice = startupChoice(prefs, workingCopy !== null);
  switch (choice.kind) {
    case "landing":
      return { project: null, path: null, notice: null };
    case "working-copy":
      return fromWorkingCopy(workingCopy);
    case "file":
      try {
        return { project: novelFromText(await readFile(choice.path)), path: choice.path, notice: null };
      } catch (error: unknown) {
        const notice = failureMessage(error, "Could not open the last novel.");
        const fallback = startupAfterUnreadable(workingCopy !== null);
        if (fallback.kind === "working-copy") {
          const recovered = fromWorkingCopy(workingCopy);
          if (recovered.project) {
            return { project: recovered.project, path: null, notice };
          }
        }
        return { project: null, path: null, notice };
      }
    default: {
      const unexpected: never = choice;
      return unexpected;
    }
  }
}

export function novelFromText(raw: string): ProjectFile {
  const project = parseProject(raw);
  if (!project) {
    throw new Error("That file could not be read as a novel.");
  }
  return project;
}

export async function placeNovel(
  step: SaveStep,
  contents: string,
  files: NovelFiles,
): Promise<string | null> {
  const path = await pathFor(step, files);
  if (!path) {
    return null;
  }
  try {
    await files.write(path, contents, step.kind !== "create");
    return path;
  } catch (error: unknown) {
    if (step.kind !== "create" || failureMessage(error, "") !== "already-exists") {
      throw error;
    }
    const next = stepAfterOccupied(step);
    const picked = await pathFor(next, files);
    if (!picked) {
      return null;
    }
    await files.write(picked, contents, true);
    return picked;
  }
}

async function pathFor(step: SaveStep, files: NovelFiles): Promise<string | null> {
  switch (step.kind) {
    case "write":
      return step.path;
    case "create":
      return joinNovelPath(await files.directory(step.directory), step.fileName);
    case "dialog":
      return files.pickSave(await files.directory(step.directory), step.fileName);
    default: {
      const unexpected: never = step;
      return unexpected;
    }
  }
}

function fromWorkingCopy(raw: string | null): StartedNovel {
  const project = raw ? parseProject(raw) : null;
  if (!project) {
    return { project: null, path: null, notice: "The saved project could not be read." };
  }
  return { project, path: null, notice: null };
}
