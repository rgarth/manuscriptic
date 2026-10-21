use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(serde::Serialize)]
pub struct ScrivenerPackage {
    pub scrivx: String,
    pub content: BTreeMap<String, String>,
    pub notes: BTreeMap<String, String>,
    pub synopsis: BTreeMap<String, String>,
}

#[tauri::command]
pub fn read_scrivener(path: String) -> Result<ScrivenerPackage, String> {
    let package = package_root(Path::new(&path))?;
    let scrivx = read_text(&find_scrivx(&package)?)?;
    let mut content = BTreeMap::new();
    let mut notes = BTreeMap::new();
    let mut synopsis = BTreeMap::new();
    let data = package.join("Files").join("Data");
    if data.is_dir() {
        for entry in fs::read_dir(&data).map_err(|err| err.to_string())? {
            let entry = entry.map_err(|err| err.to_string())?;
            if !entry.file_type().map_err(|err| err.to_string())?.is_dir() {
                continue;
            }
            let uuid = entry.file_name().to_string_lossy().to_string();
            read_optional(&entry.path().join("content.rtf"), &uuid, &mut content)?;
            read_optional(&entry.path().join("notes.rtf"), &uuid, &mut notes)?;
            read_optional(&entry.path().join("synopsis.txt"), &uuid, &mut synopsis)?;
        }
    }
    Ok(ScrivenerPackage {
        scrivx,
        content,
        notes,
        synopsis,
    })
}

fn package_root(path: &Path) -> Result<PathBuf, String> {
    if path.is_file() {
        let name = path.file_name().and_then(|name| name.to_str()).unwrap_or("");
        if name.to_ascii_lowercase().ends_with(".scrivx") {
            return path
                .parent()
                .map(Path::to_path_buf)
                .ok_or_else(|| "That folder is not a Scrivener project.".to_string());
        }
        return Err("That folder is not a Scrivener project.".to_string());
    }
    if path.is_dir() {
        return Ok(path.to_path_buf());
    }
    Err("That folder is not a Scrivener project.".to_string())
}

fn find_scrivx(root: &Path) -> Result<PathBuf, String> {
    let mut found = Vec::new();
    for entry in fs::read_dir(root).map_err(|err| err.to_string())? {
        let path = entry.map_err(|err| err.to_string())?.path();
        let scrivx = path
            .extension()
            .and_then(|ext| ext.to_str())
            .is_some_and(|ext| ext.eq_ignore_ascii_case("scrivx"));
        if scrivx && path.is_file() {
            found.push(path);
        }
    }
    if found.len() == 1 {
        return Ok(found.remove(0));
    }
    let stem = root.file_stem().and_then(|name| name.to_str()).unwrap_or("");
    if let Some(index) = found.iter().position(|path| {
        path.file_stem()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case(stem))
    }) {
        return Ok(found.remove(index));
    }
    Err("That folder is not a Scrivener project.".to_string())
}

fn read_optional(path: &Path, uuid: &str, into: &mut BTreeMap<String, String>) -> Result<(), String> {
    if path.is_file() {
        into.insert(uuid.to_string(), read_text(path)?);
    }
    Ok(())
}

fn read_text(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|err| err.to_string())?;
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[cfg(test)]
mod tests {
    use super::read_scrivener;
    use std::fs;

    #[test]
    fn a_scrivener_package_reads_the_binder_and_one_scene() {
        let dir = std::env::temp_dir().join(format!("manuscriptic-scriv-{}", std::process::id()));
        let package = dir.join("Castus.scriv");
        let scene = package.join("Files").join("Data").join("SCENE");
        fs::create_dir_all(&scene).unwrap();
        fs::write(package.join("Castus.scrivx"), "<ScrivenerProject></ScrivenerProject>").unwrap();
        fs::write(scene.join("content.rtf"), "{\\rtf1 Once}").unwrap();
        fs::write(scene.join("synopsis.txt"), "A start").unwrap();
        let read = read_scrivener(package.to_string_lossy().to_string()).unwrap();
        assert!(read.scrivx.contains("ScrivenerProject"));
        assert_eq!(read.content.get("SCENE").unwrap(), "{\\rtf1 Once}");
        assert_eq!(read.synopsis.get("SCENE").unwrap(), "A start");
        assert!(read.notes.is_empty());
        fs::remove_dir_all(dir).unwrap();
    }
}
