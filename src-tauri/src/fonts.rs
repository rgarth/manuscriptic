use std::collections::BTreeSet;
use std::sync::OnceLock;

use fontdb::{Database, Language};

#[tauri::command]
pub fn list_fonts() -> Vec<String> {
    static NAMES: OnceLock<Vec<String>> = OnceLock::new();
    NAMES.get_or_init(collect_font_names).clone()
}

fn collect_font_names() -> Vec<String> {
    let mut database = Database::new();
    database.load_system_fonts();
    let mut names = BTreeSet::new();
    for face in database.faces() {
        let english = face
            .families
            .iter()
            .find(|(_, language)| *language == Language::English_UnitedStates);
        let family = english.or_else(|| face.families.first());
        if let Some((name, _)) = family {
            names.insert(name.clone());
        }
    }
    names.into_iter().collect()
}
