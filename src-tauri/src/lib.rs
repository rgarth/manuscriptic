mod book_file;
mod book_lock;
mod documents;
mod fonts;
mod scrivener;
mod spellcheck;

use std::sync::Mutex;

use book_file::{file_exists, read_book, read_history, write_book, write_export};
use scrivener::read_scrivener;
use book_lock::{
    book_is_open, claim_book_lock, raise_book_window, refresh_book_lock, release_book_lock, release_window,
    take_book_lock,
};
use documents::documents_directory;
use fonts::list_fonts;
use spellcheck::misspellings;
use tauri::{Emitter, Manager};

static OPENED_BOOKS: Mutex<Vec<String>> = Mutex::new(Vec::new());

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_fonts,
            documents_directory,
            read_book,
            read_history,
            write_book,
            write_export,
            file_exists,
            read_scrivener,
            claim_book_lock,
            raise_book_window,
            book_is_open,
            take_book_lock,
            refresh_book_lock,
            release_book_lock,
            misspellings,
            take_opened_books,
            restore_opened_books
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let label = window.label().to_string();
                release_window(&label);
                let app = window.app_handle();
                let others = app.webview_windows().keys().any(|open| open != &label);
                if !others {
                    app.exit(0);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| open_requested_books(app, event));
}

fn open_requested_books<R: tauri::Runtime>(app: &tauri::AppHandle<R>, event: tauri::RunEvent) {
    #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
    if let tauri::RunEvent::Opened { urls } = event {
        remember_opened(app, urls);
    }
    #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
    let _ = (app, event);
}

fn opened_book(url: &tauri::Url) -> Option<String> {
    let path = url.to_file_path().ok()?;
    let extension = path.extension().and_then(|item| item.to_str())?;
    if !extension.eq_ignore_ascii_case("manuscriptic") {
        return None;
    }
    Some(path.to_string_lossy().into_owned())
}

fn remember_opened<R: tauri::Runtime>(app: &tauri::AppHandle<R>, urls: Vec<tauri::Url>) {
    let books: Vec<String> = urls.iter().filter_map(opened_book).collect();
    if books.is_empty() {
        return;
    }
    if OPENED_BOOKS
        .lock()
        .map(|mut open| {
            open.extend(books);
        })
        .is_err()
    {
        return;
    }
    let _ = app.emit("opened-books", ());
}

#[tauri::command]
fn take_opened_books() -> Vec<String> {
    OPENED_BOOKS
        .lock()
        .map(|mut open| std::mem::take(&mut *open))
        .unwrap_or_default()
}

#[tauri::command]
fn restore_opened_books(app: tauri::AppHandle, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    if OPENED_BOOKS
        .lock()
        .map(|mut open| {
            let mut restored = paths;
            restored.append(&mut *open);
            *open = restored;
        })
        .is_err()
    {
        return;
    }
    let _ = app.emit("opened-books", ());
}

#[cfg(test)]
mod tests {
    use super::opened_book;

    #[test]
    fn a_manuscriptic_file_opens_and_another_file_does_not() {
        let book = tauri::Url::from_file_path("/Novels/Castus.manuscriptic").expect("book");
        assert_eq!(opened_book(&book).as_deref(), Some("/Novels/Castus.manuscriptic"));
        let titled = tauri::Url::from_file_path("/Novels/Castus.MANUSCRIPTIC").expect("titled");
        assert_eq!(opened_book(&titled).as_deref(), Some("/Novels/Castus.MANUSCRIPTIC"));
        let other = tauri::Url::from_file_path("/Novels/notes.txt").expect("other");
        assert_eq!(opened_book(&other), None);
    }
}
