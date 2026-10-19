mod book_file;
mod fonts;
mod project_store;

use book_file::{read_book, write_book};
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
            write_book
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
