mod fonts;
mod project_store;

use fonts::list_fonts;
use project_store::{load_project, save_project};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_project, save_project, list_fonts])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
