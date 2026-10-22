mod book_file;
mod book_lock;
mod documents;
mod fonts;
mod scrivener;
mod spellcheck;

use book_file::{file_exists, read_book, read_history, write_book, write_export};
use scrivener::read_scrivener;
use book_lock::{claim_book_lock, refresh_book_lock, release_book_lock, release_window, take_book_lock};
use documents::documents_directory;
use fonts::list_fonts;
use spellcheck::misspellings;
use tauri::Manager;

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
            take_book_lock,
            refresh_book_lock,
            release_book_lock,
            misspellings
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
