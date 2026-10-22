import { wordCount, type EditorDoc } from "./model/editorDoc.ts";

function paragraph(text: string): EditorDoc["content"][number] {
  return text
    ? { type: "paragraph", content: [{ type: "text", text }] }
    : { type: "paragraph" };
}

function page(lines: string[]): EditorDoc {
  return { type: "doc", content: lines.map((line) => paragraph(line)) };
}

export function publishingStarter(title: string): EditorDoc | null {
  switch (title) {
    case "Title page":
      return page([
        "{$author}",
        "{$address}",
        "{$phone}",
        "{$email}",
        "",
        "{$title}",
        "",
        "by {$pen}",
        "",
        "{$words} words",
      ]);
    case "Copyright":
      return page(["Copyright {$year} {$author}"]);
    case "Query":
      return page(["{$title}, {$words} words.", "", "", "", "{$author}", "{$email}", "{$phone}"]);
    default:
      return null;
  }
}

export function publishingHint(role: string, title: string, content: EditorDoc): string | null {
  if (role !== "page" || wordCount(content) > 0) {
    return null;
  }
  switch (title) {
    case "Synopsis":
      return "Present tense. The whole plot, including the ending.";
    case "Query":
      return "This is usually pasted into the email, not bound into the manuscript.";
    default:
      return null;
  }
}
