import { getSchema } from "@tiptap/core";
import type { Node as ProseNode } from "@tiptap/pm/model";
import { Transform } from "@tiptap/pm/transform";
import { documentExtensions } from "./editorExtensions.ts";
import { parseEditorDoc, type EditorDoc } from "./model/editorDoc.ts";
import {
  findNode,
  openFolders,
  setDocumentContent,
  setView,
  type BinderNode,
  type DocumentNode,
  type ProjectFile,
} from "./model/project.ts";

export type FindScope = "document" | "book";

export type FindHit = {
  from: number;
  to: number;
};

export type BookHit = FindHit & {
  documentId: string;
  title: string;
};

const bookRoots = ["manuscript", "notes", "publishing"] as const;

export const editorSchema = getSchema(documentExtensions);

export function hitsInNode(doc: ProseNode, query: string, matchCase: boolean): FindHit[] {
  if (!query) {
    return [];
  }
  const hits: FindHit[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return;
    }
    let text = "";
    let origin = 0;
    let open = false;
    node.forEach((child, offset) => {
      if (!child.isText || !child.text) {
        pushMatches(hits, text, origin, query, matchCase);
        text = "";
        open = false;
        return;
      }
      if (!open) {
        origin = pos + 1 + offset;
        open = true;
      }
      text += child.text;
    });
    pushMatches(hits, text, origin, query, matchCase);
    return false;
  });
  return hits;
}

export function hitsInDoc(doc: EditorDoc, query: string, matchCase: boolean): FindHit[] {
  if (!query || doc.content.length === 0) {
    return [];
  }
  return hitsInNode(editorSchema.nodeFromJSON(doc), query, matchCase);
}

export function replaceHit(
  doc: EditorDoc,
  hit: FindHit,
  replacement: string,
  query: string,
  matchCase: boolean,
): EditorDoc | null {
  const live = hitsInDoc(doc, query, matchCase).some((item) => item.from === hit.from && item.to === hit.to);
  if (!live) {
    return null;
  }
  return storedDoc(replaceRange(editorSchema.nodeFromJSON(doc), hit.from, hit.to, replacement));
}

export function replaceAllInDoc(
  doc: EditorDoc,
  query: string,
  replacement: string,
  matchCase: boolean,
): { doc: EditorDoc; count: number } {
  const hits = hitsInDoc(doc, query, matchCase);
  if (hits.length === 0) {
    return { doc, count: 0 };
  }
  let node = editorSchema.nodeFromJSON(doc);
  for (let index = hits.length - 1; index >= 0; index -= 1) {
    const hit = hits[index];
    node = replaceRange(node, hit.from, hit.to, replacement);
  }
  return { doc: storedDoc(node), count: hits.length };
}

export function documentsIn(project: ProjectFile, scope: FindScope, selectedId: string | null): DocumentNode[] {
  if (scope === "document") {
    const selected = selectedId ? findNode(project, selectedId) : null;
    return selected?.node.kind === "document" ? [selected.node] : [];
  }
  const docs: DocumentNode[] = [];
  for (const key of bookRoots) {
    collectDocuments(project[key], docs);
  }
  return docs;
}

export function hitsInProject(
  project: ProjectFile,
  scope: FindScope,
  selectedId: string | null,
  query: string,
  matchCase: boolean,
): BookHit[] {
  const hits: BookHit[] = [];
  for (const doc of documentsIn(project, scope, selectedId)) {
    for (const hit of hitsInDoc(doc.content, query, matchCase)) {
      hits.push({ documentId: doc.id, title: doc.title, ...hit });
    }
  }
  return hits;
}

export function replaceHitInProject(
  project: ProjectFile,
  hit: BookHit,
  replacement: string,
  query: string,
  matchCase: boolean,
): ProjectFile | null {
  const located = findNode(project, hit.documentId);
  if (!located || located.node.kind !== "document") {
    return null;
  }
  const content = replaceHit(located.node.content, hit, replacement, query, matchCase);
  if (!content) {
    return null;
  }
  return setDocumentContent(project, hit.documentId, content);
}

export function replaceAllInProject(
  project: ProjectFile,
  scope: FindScope,
  selectedId: string | null,
  query: string,
  replacement: string,
  matchCase: boolean,
): { project: ProjectFile; count: number } {
  let next = project;
  let count = 0;
  for (const doc of documentsIn(project, scope, selectedId)) {
    const replaced = replaceAllInDoc(doc.content, query, replacement, matchCase);
    count += replaced.count;
    if (replaced.count > 0) {
      next = setDocumentContent(next, doc.id, replaced.doc);
    }
  }
  return { project: next, count };
}

export function stepAfterReplace(
  project: ProjectFile,
  hit: BookHit,
  replacement: string,
  query: string,
  matchCase: boolean,
  scope: FindScope,
): { project: ProjectFile; index: number; hit: BookHit | null } | null {
  const replaced = replaceHitInProject(project, hit, replacement, query, matchCase);
  if (!replaced) {
    return null;
  }
  const nextHits = hitsInProject(replaced, scope, replaced.view.selectedId, query, matchCase);
  const order = documentsIn(replaced, scope, replaced.view.selectedId).map((doc) => doc.id);
  const index = hitIndexAfter(nextHits, order, hit.documentId, hit.from + replacement.length);
  const safe = nextHits.length === 0 || index < 0 ? 0 : Math.min(index, nextHits.length - 1);
  return { project: replaced, index, hit: index < 0 ? null : (nextHits[safe] ?? null) };
}

export function hitIndexAfter(
  hits: readonly BookHit[],
  order: readonly string[],
  documentId: string,
  from: number,
): number {
  const place = order.indexOf(documentId);
  for (let index = 0; index < hits.length; index += 1) {
    const hit = hits[index];
    const hitPlace = order.indexOf(hit.documentId);
    if (hitPlace > place || (hit.documentId === documentId && hit.from >= from)) {
      return index;
    }
  }
  return hits.length > 0 ? 0 : -1;
}

export function selectDocument(project: ProjectFile, id: string): ProjectFile {
  const open = new Set(project.view.expanded ?? openFolders(project));
  let located = findNode(project, id);
  while (located?.parent) {
    open.add(located.parent.id);
    located = findNode(project, located.parent.id);
  }
  return setView(project, { selectedId: id, expanded: [...open] });
}

export function preferOpen(hits: readonly BookHit[], selectedId: string | null): number {
  if (!selectedId) {
    return 0;
  }
  const index = hits.findIndex((hit) => hit.documentId === selectedId);
  return index >= 0 ? index : 0;
}

function collectDocuments(node: BinderNode, docs: DocumentNode[]): void {
  switch (node.kind) {
    case "document":
      docs.push(node);
      return;
    case "folder":
      for (const child of node.children) {
        collectDocuments(child, docs);
      }
      return;
    default: {
      const unexpected: never = node;
      throw new Error(`Unexpected binder node: ${String(unexpected)}`);
    }
  }
}

function pushMatches(hits: FindHit[], text: string, origin: number, query: string, matchCase: boolean) {
  if (!text) {
    return;
  }
  const needle = matchCase ? query : query.toLocaleLowerCase();
  let index = 0;
  while (index + query.length <= text.length) {
    const slice = text.slice(index, index + query.length);
    const found = matchCase ? slice === query : slice.toLocaleLowerCase() === needle;
    if (found) {
      hits.push({ from: origin + index, to: origin + index + query.length });
      index += query.length;
      continue;
    }
    index += 1;
  }
}

function replaceRange(doc: ProseNode, from: number, to: number, replacement: string): ProseNode {
  const change = new Transform(doc);
  if (replacement) {
    change.replaceWith(from, to, editorSchema.text(replacement, marksInside(doc, from)));
  } else {
    change.delete(from, to);
  }
  return change.doc;
}

export function marksInside(doc: ProseNode, from: number) {
  const $from = doc.resolve(from);
  const node = $from.textOffset ? $from.parent.child($from.index()) : $from.nodeAfter;
  return node?.isText ? node.marks : [];
}

function storedDoc(doc: ProseNode): EditorDoc {
  const parsed = parseEditorDoc(doc.toJSON());
  if (!parsed) {
    throw new Error("Replaced document could not be stored.");
  }
  return parsed;
}
