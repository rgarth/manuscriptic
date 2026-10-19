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

export function writeBook(
  path: string,
  files: Record<string, string>,
  overwrite: boolean,
): Promise<void> {
  return invoke("write_book", { path, files, overwrite });
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
