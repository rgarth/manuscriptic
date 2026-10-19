mod book_file;
mod book_lock;
mod documents;
mod fonts;

use book_file::{read_book, read_history, write_book};
use book_lock::{claim_book_lock, refresh_book_lock, release_book_lock, release_window, take_book_lock};
use documents::documents_directory;
use fonts::list_fonts;

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
            claim_book_lock,
            take_book_lock,
            refresh_book_lock,
            release_book_lock
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                release_window(window.label());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
