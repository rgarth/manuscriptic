mod book_file;
mod book_lock;
mod fonts;
mod project_store;

use book_file::{read_book, write_book};
use book_lock::{claim_book_lock, refresh_book_lock, release_book_lock, release_window, take_book_lock};
use fonts::list_fonts;
use project_store::{
    documents_directory, load_project, read_novel_file, save_project, write_novel_file,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            load_project,
            save_project,
            list_fonts,
            documents_directory,
            read_novel_file,
            write_novel_file,
            read_book,
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
