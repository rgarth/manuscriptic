use std::collections::{BTreeMap, BTreeSet};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use zip::result::ZipError;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const HISTORY_FILE: &str = "history.json";

#[tauri::command]
pub fn read_book(path: String) -> Result<BTreeMap<String, String>, String> {
    let file = File::open(&path).map_err(|err| err.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|err| err.to_string())?;
    let mut files = BTreeMap::new();
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|err| err.to_string())?;
        let name = entry.name().to_string();
        if name == HISTORY_FILE {
            continue;
        }
        if !safe_entry(&name) {
            return Err(format!("The book contains an unsafe path: {name}"));
        }
        if entry.is_dir() {
            continue;
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
pub fn read_history(path: String) -> Result<Option<String>, String> {
    let file = File::open(&path).map_err(|err| err.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|err| err.to_string())?;
    let mut entry = match archive.by_name(HISTORY_FILE) {
        Ok(entry) => entry,
        Err(ZipError::FileNotFound) => return Ok(None),
        Err(err) => return Err(err.to_string()),
    };
    let mut text = String::new();
    entry.read_to_string(&mut text).map_err(|err| err.to_string())?;
    Ok(Some(text))
}

#[tauri::command]
pub fn write_book(
    path: String,
    files: BTreeMap<String, String>,
    keep: Vec<String>,
    overwrite: bool,
) -> Result<(), String> {
    for name in files.keys().chain(keep.iter()) {
        if !safe_entry(name) {
            return Err(format!("Refusing to write an unsafe path: {name}"));
        }
    }
    if !files.contains_key("binder.json") && !keep.iter().any(|name| name == "binder.json") {
        return Err("A book needs a binder.".to_string());
    }
    let target = PathBuf::from(&path);
    if target.exists() && !overwrite {
        return Err("already-exists".to_string());
    }
    if let Some(parent) = target.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
    }
    if !target.exists() && !keep.is_empty() {
        return Err("That book is not on disk.".to_string());
    }
    if keep.is_empty() {
        return write_fresh(&target, &files);
    }
    write_patch(&target, &files, &keep)
}

fn write_fresh(target: &Path, files: &BTreeMap<String, String>) -> Result<(), String> {
    write_atomically(target, |writer| write_texts(writer, files))
}

fn write_patch(target: &Path, files: &BTreeMap<String, String>, keep: &[String]) -> Result<(), String> {
    let source = File::open(target).map_err(|err| err.to_string())?;
    let mut archive = ZipArchive::new(source).map_err(|err| err.to_string())?;
    let keep_names: BTreeSet<&str> = keep.iter().map(String::as_str).collect();
    write_atomically(target, |writer| {
        let mut copied = BTreeSet::new();
        for index in 0..archive.len() {
            let entry = archive.by_index(index).map_err(|err| err.to_string())?;
            let name = entry.name().to_string();
            if files.contains_key(&name) || !keep_names.contains(name.as_str()) {
                continue;
            }
            if !copied.insert(name.clone()) {
                continue;
            }
            writer.raw_copy_file(entry).map_err(|err| err.to_string())?;
        }
        for name in &keep_names {
            if !copied.contains(*name) && !files.contains_key(*name) {
                return Err(format!("The book on disk is missing {name}. This window did not save."));
            }
        }
        write_texts(writer, files)
    })
}

fn write_texts(writer: &mut ZipWriter<File>, files: &BTreeMap<String, String>) -> Result<(), String> {
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    for (name, text) in files {
        writer.start_file(name, options).map_err(|err| err.to_string())?;
        writer.write_all(text.as_bytes()).map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn write_atomically(target: &Path, build: impl FnOnce(&mut ZipWriter<File>) -> Result<(), String>) -> Result<(), String> {
    let temporary = temp_path(target);
    let written = (|| {
        let file = File::create(&temporary).map_err(|err| err.to_string())?;
        let mut writer = ZipWriter::new(file);
        build(&mut writer)?;
        let written = writer.finish().map_err(|err| err.to_string())?;
        written.sync_all().map_err(|err| err.to_string())?;
        fs::rename(&temporary, target).map_err(|err| err.to_string())
    })();
    if written.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    written
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

#[cfg(test)]
mod tests {
    use super::{read_book, read_history, write_book};
    use std::fs::{self, File};
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::{CompressionMethod, ZipArchive, ZipWriter};

    fn book_dir() -> std::path::PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let id = NEXT.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("manuscriptic-zip-{}-{id}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_book_zip_round_trips_the_binder_and_a_scene() {
        let dir = book_dir();
        let path = dir.join("Castus.manuscriptic");
        let mut files = std::collections::BTreeMap::new();
        files.insert("binder.json".to_string(), "{\"title\":\"Castus\"}\n".to_string());
        files.insert(
            "scenes/opening.prose".to_string(),
            "p The [[b]]long[[/b]] road\n".to_string(),
        );
        write_book(path.to_string_lossy().to_string(), files.clone(), Vec::new(), false).unwrap();
        let refused = write_book(path.to_string_lossy().to_string(), files.clone(), Vec::new(), false);
        assert_eq!(refused.unwrap_err(), "already-exists");
        let read = read_book(path.to_string_lossy().to_string()).unwrap();
        assert_eq!(read.get("scenes/opening.prose").unwrap(), "p The [[b]]long[[/b]] road\n");
        assert_eq!(read_history(path.to_string_lossy().to_string()).unwrap(), None);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_save_copies_unchanged_entries_and_replaces_the_scene() {
        let dir = book_dir();
        let path = dir.join("Castus.manuscriptic");
        let mut stored = ZipWriter::new(File::create(&path).unwrap());
        let plain = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        stored.start_file("binder.json", plain).unwrap();
        stored.write_all(b"{\"title\":\"Castus\"}\n").unwrap();
        stored.start_file("scenes/opening.prose", plain).unwrap();
        stored.write_all(b"p One\n").unwrap();
        stored.start_file("history.json", plain).unwrap();
        stored.write_all(b"{\"checkpoint\":{},\"snapshots\":[]}\n").unwrap();
        stored.finish().unwrap();

        let mut changed = std::collections::BTreeMap::new();
        changed.insert("binder.json".to_string(), "{\"title\":\"Castus\"}\n".to_string());
        changed.insert("scenes/opening.prose".to_string(), "p Two\n".to_string());
        write_book(
            path.to_string_lossy().to_string(),
            changed,
            vec!["history.json".to_string()],
            true,
        )
        .unwrap();

        let read = read_book(path.to_string_lossy().to_string()).unwrap();
        assert_eq!(read.get("scenes/opening.prose").unwrap(), "p Two\n");
        assert_eq!(
            read_history(path.to_string_lossy().to_string()).unwrap().as_deref(),
            Some("{\"checkpoint\":{},\"snapshots\":[]}\n")
        );
        let archive_file = File::open(&path).unwrap();
        let mut archive = ZipArchive::new(archive_file).unwrap();
        let history = archive.by_name("history.json").unwrap();
        assert_eq!(history.compression(), CompressionMethod::Stored);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_missing_kept_entry_leaves_the_book_alone() {
        let dir = book_dir();
        let path = dir.join("Castus.manuscriptic");
        let mut files = std::collections::BTreeMap::new();
        files.insert("binder.json".to_string(), "{\"title\":\"Castus\"}\n".to_string());
        files.insert("scenes/opening.prose".to_string(), "p One\n".to_string());
        write_book(path.to_string_lossy().to_string(), files, Vec::new(), false).unwrap();
        let mut changed = std::collections::BTreeMap::new();
        changed.insert("binder.json".to_string(), "{\"title\":\"Castus\"}\n".to_string());
        let failed = write_book(
            path.to_string_lossy().to_string(),
            changed,
            vec!["scenes/missing.prose".to_string()],
            true,
        );
        assert!(failed.unwrap_err().contains("missing"));
        let read = read_book(path.to_string_lossy().to_string()).unwrap();
        assert_eq!(read.get("scenes/opening.prose").unwrap(), "p One\n");
        fs::remove_dir_all(dir).unwrap();
    }
}
