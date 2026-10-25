import { invoke } from "@tauri-apps/api/core";
import type { BookLock } from "./bookLock.ts";

export function listFonts(): Promise<string[]> {
  return invoke<string[]>("list_fonts");
}

export function documentsDirectory(): Promise<string> {
  return invoke<string>("documents_directory");
}

export function readBook(path: string): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("read_book", { path });
}

export function readScrivener(path: string): Promise<{
  scrivx: string;
  content: Record<string, string>;
  notes: Record<string, string>;
  synopsis: Record<string, string>;
}> {
  return invoke("read_scrivener", { path });
}

export function readHistory(path: string): Promise<string | null> {
  return invoke<string | null>("read_history", { path });
}

export function fileExists(path: string): Promise<boolean> {
  return invoke<boolean>("file_exists", { path });
}

export function writeExport(path: string, bytes: Uint8Array): Promise<void> {
  return invoke("write_export", { path, bytes: Array.from(bytes) });
}

export function writeBook(
  path: string,
  files: Record<string, string>,
  keep: string[],
  overwrite: boolean,
): Promise<void> {
  return invoke("write_book", { path, files, keep, overwrite });
}

export function bookIsOpen(path: string): Promise<boolean> {
  return invoke<boolean>("book_is_open", { path });
}

export function raiseBookWindow(path: string): Promise<boolean> {
  return invoke<boolean>("raise_book_window", { path });
}

export function takeOpenedBooks(): Promise<string[]> {
  return invoke<string[]>("take_opened_books");
}

export function restoreOpenedBooks(paths: string[]): Promise<void> {
  return invoke("restore_opened_books", { paths });
}

export function claimBookLock(path: string, holder: string): Promise<BookLock> {
  return invoke<BookLock>("claim_book_lock", { path, holder });
}

export function takeBookLock(path: string, holder: string): Promise<BookLock> {
  return invoke<BookLock>("take_book_lock", { path, holder });
}

export function refreshBookLock(path: string, holder: string): Promise<boolean> {
  return invoke<boolean>("refresh_book_lock", { path, holder });
}

export function releaseBookLock(path: string, holder: string): Promise<void> {
  return invoke("release_book_lock", { path, holder });
}

export function misspellings(text: string): Promise<{ from: number; to: number }[]> {
  return invoke("misspellings", { text });
}
