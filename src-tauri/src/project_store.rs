use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager};

const BACKUP_INTERVAL: Duration = Duration::from_secs(30 * 60);

fn project_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|err| err.to_string())?;
    Ok(base.join("manuscriptic"))
}

#[tauri::command]
pub fn documents_directory(app: AppHandle) -> Result<String, String> {
    let path = app.path().document_dir().map_err(|err| err.to_string())?;
    path.into_os_string()
        .into_string()
        .map_err(|_| "Could not find the Documents folder.".to_string())
}

#[tauri::command]
pub fn read_novel_file(path: String) -> Result<String, String> {
    let contents = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    serde_json::from_str::<Value>(&contents).map_err(|err| err.to_string())?;
    Ok(contents)
}

#[tauri::command]
pub fn write_novel_file(path: String, contents: String, overwrite: bool) -> Result<(), String> {
    write_novel_at(Path::new(&path), &contents, overwrite)
}

pub fn write_novel_at(path: &Path, contents: &str, overwrite: bool) -> Result<(), String> {
    serde_json::from_str::<Value>(contents).map_err(|err| err.to_string())?;
    if path.exists() && !overwrite {
        return Err("already-exists".to_string());
    }
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
    }
    let mut temporary = path.as_os_str().to_owned();
    temporary.push(".tmp");
    let tmp = PathBuf::from(temporary);
    fs::write(&tmp, contents).map_err(|err| err.to_string())?;
    replace_file(&tmp, path)
}

#[tauri::command]
pub fn load_project(app: AppHandle) -> Result<Option<String>, String> {
    let path = project_dir(&app)?.join("current-project.json");
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path).map_err(|err| err.to_string())?;
    serde_json::from_str::<Value>(&contents).map_err(|err| err.to_string())?;
    Ok(Some(contents))
}

#[tauri::command]
pub fn save_project(
    app: AppHandle,
    contents: String,
    previous: Option<String>,
) -> Result<(), String> {
    serde_json::from_str::<Value>(&contents).map_err(|err| err.to_string())?;
    if let Some(previous) = &previous {
        serde_json::from_str::<Value>(previous).map_err(|err| err.to_string())?;
    }
    let dir = project_dir(&app)?;
    store_project(&dir, &contents, previous.as_deref())
}

#[cfg(unix)]
fn replace_file(tmp: &Path, target: &Path) -> Result<(), String> {
    fs::rename(tmp, target).map_err(|err| err.to_string())
}

#[cfg(windows)]
fn replace_file(tmp: &Path, target: &Path) -> Result<(), String> {
    if target.exists() {
        fs::remove_file(target).map_err(|err| err.to_string())?;
    }
    fs::rename(tmp, target).map_err(|err| err.to_string())
}

fn store_project(dir: &Path, contents: &str, previous: Option<&str>) -> Result<(), String> {
    if let Some(previous) = previous {
        write_backup(dir, previous)?;
    }
    fs::create_dir_all(dir).map_err(|err| err.to_string())?;
    let target = dir.join("current-project.json");
    let tmp = dir.join("current-project.json.tmp");
    fs::write(&tmp, contents).map_err(|err| err.to_string())?;
    replace_file(&tmp, &target)?;
    write_backup_if_due(dir, contents)
}

fn write_backup_if_due(dir: &Path, contents: &str) -> Result<(), String> {
    let backups = dir.join("backups");
    fs::create_dir_all(&backups).map_err(|err| err.to_string())?;
    if let Some(age) = newest_backup_age(&backups)? {
        if age < BACKUP_INTERVAL {
            return Ok(());
        }
    }
    write_backup(dir, contents)
}

fn write_backup(dir: &Path, contents: &str) -> Result<(), String> {
    let backups = dir.join("backups");
    fs::create_dir_all(&backups).map_err(|err| err.to_string())?;
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_secs();
    fs::write(backups.join(format!("backup-{secs}.json")), contents).map_err(|err| err.to_string())
}

fn newest_backup_age(dir: &Path) -> Result<Option<Duration>, String> {
    let mut newest: Option<SystemTime> = None;
    for entry in fs::read_dir(dir).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        if !entry
            .file_name()
            .to_string_lossy()
            .starts_with("backup-")
        {
            continue;
        }
        let modified = entry
            .metadata()
            .map_err(|err| err.to_string())?
            .modified()
            .map_err(|err| err.to_string())?;
        newest = Some(match newest {
            Some(current) if current >= modified => current,
            _ => modified,
        });
    }
    match newest {
        Some(time) => Ok(Some(time.elapsed().unwrap_or_default())),
        None => Ok(None),
    }
}

#[cfg(test)]
mod tests {
    use super::{store_project, write_backup, write_backup_if_due, write_novel_at};
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn temp_project_dir() -> std::path::PathBuf {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let id = NEXT.fetch_add(1, Ordering::Relaxed);
        let dir = std::env::temp_dir().join(format!("manuscriptic-backup-{}-{id}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn backup_names(dir: &std::path::Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir.join("backups"))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn backup_file_is_named_with_unix_seconds() {
        let dir = temp_project_dir();
        write_backup(&dir, "{\"ok\":true}").unwrap();
        let names = backup_names(&dir);
        assert_eq!(names.len(), 1);
        assert!(names[0].starts_with("backup-"));
        assert!(names[0].ends_with(".json"));
        let stamp = names[0].trim_start_matches("backup-").trim_end_matches(".json");
        assert!(stamp.chars().all(|ch| ch.is_ascii_digit()));
        assert_eq!(
            fs::read_to_string(dir.join("backups").join(&names[0])).unwrap(),
            "{\"ok\":true}"
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_recent_backup_is_not_replaced() {
        let dir = temp_project_dir();
        write_backup(&dir, "first").unwrap();
        write_backup_if_due(&dir, "second").unwrap();
        let names = backup_names(&dir);
        assert_eq!(names.len(), 1);
        assert_eq!(
            fs::read_to_string(dir.join("backups").join(&names[0])).unwrap(),
            "first"
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn replace_keeps_the_outgoing_book() {
        let dir = temp_project_dir();
        store_project(&dir, "{\"next\":true}", Some("{\"prev\":true}")).unwrap();
        assert_eq!(
            fs::read_to_string(dir.join("current-project.json")).unwrap(),
            "{\"next\":true}"
        );
        let names = backup_names(&dir);
        assert_eq!(names.len(), 1);
        assert_eq!(
            fs::read_to_string(dir.join("backups").join(&names[0])).unwrap(),
            "{\"prev\":true}"
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_new_novel_file_is_written_once_until_overwrite_is_allowed() {
        let dir = temp_project_dir();
        let path = dir.join("Castus.json");
        write_novel_at(&path, "{\"title\":\"Castus\"}", false).unwrap();
        let refused = write_novel_at(&path, "{\"title\":\"Other\"}", false);
        assert_eq!(refused.unwrap_err(), "already-exists");
        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"title\":\"Castus\"}");
        write_novel_at(&path, "{\"title\":\"Other\"}", true).unwrap();
        assert_eq!(fs::read_to_string(&path).unwrap(), "{\"title\":\"Other\"}");
        fs::remove_dir_all(dir).unwrap();
    }
}

