use std::collections::BTreeSet;
use std::sync::OnceLock;

use fontdb::{Database, Family, Language, Query, Source, Stretch, Style, Weight};
use tauri::ipc::Response;

struct LoadedFace {
    bytes: Vec<u8>,
    index: u32,
    postscript: String,
    weight: u16,
    italic: bool,
}

#[tauri::command]
pub fn list_fonts() -> Vec<String> {
    static NAMES: OnceLock<Vec<String>> = OnceLock::new();
    NAMES.get_or_init(collect_font_names).clone()
}

#[tauri::command]
pub fn read_font(family: String, bold: bool, italic: bool) -> Result<Response, String> {
    let face = read_face(&family, bold, italic).ok_or_else(|| format!("Could not find the font {family}."))?;
    Ok(Response::new(pack(&face)?))
}

fn database() -> &'static Database {
    static DB: OnceLock<Database> = OnceLock::new();
    DB.get_or_init(|| {
        let mut fonts = Database::new();
        fonts.load_system_fonts();
        fonts
    })
}

fn collect_font_names() -> Vec<String> {
    let mut names = BTreeSet::new();
    for face in database().faces() {
        let english = face
            .families
            .iter()
            .find(|(_, language)| *language == Language::English_UnitedStates);
        let family = english.or_else(|| face.families.first());
        if let Some((name, _)) = family {
            if !name.starts_with('.') {
                names.insert(name.clone());
            }
        }
    }
    names.into_iter().collect()
}

fn read_face(family: &str, bold: bool, italic: bool) -> Option<LoadedFace> {
    let fonts = database();
    let id = fonts.query(&Query {
        families: &[Family::Name(family)],
        weight: if bold { Weight::BOLD } else { Weight::NORMAL },
        stretch: Stretch::Normal,
        style: if italic { Style::Italic } else { Style::Normal },
    })?;
    let info = fonts.face(id)?;
    let postscript = info.post_script_name.clone();
    let weight = info.weight.0;
    let italic = !matches!(info.style, Style::Normal);
    let (source, index) = fonts.face_source(id)?;
    let bytes = source_bytes(&source)?;
    Some(LoadedFace {
        bytes,
        index,
        postscript,
        weight,
        italic,
    })
}

fn source_bytes(source: &Source) -> Option<Vec<u8>> {
    match source {
        Source::Binary(data) => Some(data.as_ref().as_ref().to_vec()),
        Source::File(path) => std::fs::read(path).ok(),
        Source::SharedFile(_, data) => Some(data.as_ref().as_ref().to_vec()),
    }
}

// Little-endian: index u32, weight u16, italic u8, name length u8, name, font bytes.
fn pack(face: &LoadedFace) -> Result<Vec<u8>, String> {
    let name = face.postscript.as_bytes();
    let name_len = u8::try_from(name.len()).map_err(|_| "Could not read the font.".to_string())?;
    let mut packed = Vec::with_capacity(8 + name.len() + face.bytes.len());
    packed.extend_from_slice(&face.index.to_le_bytes());
    packed.extend_from_slice(&face.weight.to_le_bytes());
    packed.push(u8::from(face.italic));
    packed.push(name_len);
    packed.extend_from_slice(name);
    packed.extend_from_slice(&face.bytes);
    Ok(packed)
}

#[cfg(test)]
mod tests {
    use super::{collect_font_names, read_face};

    #[test]
    fn a_missing_family_is_absent() {
        assert!(read_face("Manuscriptic Missing", false, false).is_none());
    }

    #[test]
    fn an_installed_family_returns_font_bytes() {
        let Some(name) = collect_font_names().into_iter().next() else {
            return;
        };
        let face = read_face(&name, false, false).expect("installed face");
        assert!(!face.bytes.is_empty());
        assert!(!face.postscript.is_empty());
    }

    #[test]
    fn times_new_roman_bold_is_its_own_file() {
        let Some(regular) = read_face("Times New Roman", false, false) else {
            return;
        };
        let Some(bold) = read_face("Times New Roman", true, false) else {
            return;
        };
        assert!(bold.weight >= 600);
        assert_ne!(regular.postscript, bold.postscript);
    }

    #[test]
    fn a_missing_windows_face_is_not_invented() {
        if read_face("Times New Roman", false, false).is_some() {
            return;
        }
        assert!(!collect_font_names().iter().any(|name| name == "Times New Roman"));
    }
}
