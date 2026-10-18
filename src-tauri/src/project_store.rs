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
pub fn save_project(app: AppHandle, contents: String) -> Result<(), String> {
    serde_json::from_str::<Value>(&contents).map_err(|err| err.to_string())?;
    let dir = project_dir(&app)?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let target = dir.join("current-project.json");
    let tmp = dir.join("current-project.json.tmp");
    fs::write(&tmp, &contents).map_err(|err| err.to_string())?;
    replace_file(&tmp, &target)?;
    write_backup_if_due(&dir, &contents)?;
    Ok(())
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

fn write_backup_if_due(dir: &Path, contents: &str) -> Result<(), String> {
    let backups = dir.join("backups");
    fs::create_dir_all(&backups).map_err(|err| err.to_string())?;
    if let Some(age) = newest_backup_age(&backups)? {
        if age < BACKUP_INTERVAL {
            return Ok(());
        }
    }
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

