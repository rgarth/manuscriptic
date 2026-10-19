use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

#[tauri::command]
pub fn read_book(path: String) -> Result<BTreeMap<String, String>, String> {
    let file = File::open(&path).map_err(|err| err.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|err| err.to_string())?;
    let mut files = BTreeMap::new();
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|err| err.to_string())?;
        let name = entry.name().to_string();
        if !safe_entry(&name) {
            return Err(format!("The book contains an unsafe path: {name}"));
        }
        let mut text = String::new();
        entry.read_to_string(&mut text).map_err(|err| err.to_string())?;
        files.insert(name, text);
    }
    if !files.contains_key("binder.json") {
        return Err("That file is not a Manuscriptic book.".to_string());
    }
    Ok(files)
}

#[tauri::command]
pub fn write_book(path: String, files: BTreeMap<String, String>, overwrite: bool) -> Result<(), String> {
    for name in files.keys() {
        if !safe_entry(name) {
            return Err(format!("Refusing to write an unsafe path: {name}"));
        }
    }
    if !files.contains_key("binder.json") {
        return Err("A book needs a binder.".to_string());
    }
    let target = PathBuf::from(&path);
    if target.exists() && !overwrite {
        return Err("already-exists".to_string());
    }
    let bytes = zip_bytes(&files)?;
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
    }
    let temporary = temp_path(&target);
    fs::write(&temporary, bytes).map_err(|err| err.to_string())?;
    replace_file(&temporary, &target)
}

fn zip_bytes(files: &BTreeMap<String, String>) -> Result<Vec<u8>, String> {
    let mut cursor = Cursor::new(Vec::new());
    {
        let mut writer = ZipWriter::new(&mut cursor);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        for (name, text) in files {
            writer.start_file(name, options).map_err(|err| err.to_string())?;
            writer.write_all(text.as_bytes()).map_err(|err| err.to_string())?;
        }
        writer.finish().map_err(|err| err.to_string())?;
    }
    Ok(cursor.into_inner())
}

fn safe_entry(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('/')
        && !name.split(['/', '\\']).any(|part| part.is_empty() || part == ".." || part == ".")
}

fn temp_path(target: &Path) -> PathBuf {
    let mut temporary = target.as_os_str().to_owned();
    temporary.push(".tmp");
    PathBuf::from(temporary)
}

fn replace_file(tmp: &Path, target: &Path) -> Result<(), String> {
    fs::rename(tmp, target).map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::{read_book, write_book};
    use std::fs;

    #[test]
    fn a_book_zip_round_trips_the_binder_and_a_scene() {
        let dir = std::env::temp_dir().join(format!("manuscriptic-zip-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("Castus.manuscriptic");
        let mut files = std::collections::BTreeMap::new();
        files.insert("binder.json".to_string(), "{\"title\":\"Castus\"}\n".to_string());
        files.insert(
            "scenes/opening.prose".to_string(),
            "p The [[b]]long[[/b]] road\n".to_string(),
        );
        write_book(path.to_string_lossy().to_string(), files.clone(), false).unwrap();
        let refused = write_book(path.to_string_lossy().to_string(), files.clone(), false);
        assert_eq!(refused.unwrap_err(), "already-exists");
        let read = read_book(path.to_string_lossy().to_string()).unwrap();
        assert_eq!(read.get("scenes/opening.prose").unwrap(), "p The [[b]]long[[/b]] road\n");
        fs::remove_dir_all(dir).unwrap();
    }
}
