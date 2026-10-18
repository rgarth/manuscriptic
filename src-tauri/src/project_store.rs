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
    let stamp = dated_stamp()?;
    fs::write(backups.join(format!("backup-{stamp}.json")), contents).map_err(|err| err.to_string())
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

fn dated_stamp() -> Result<String, String> {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|err| err.to_string())?
        .as_secs();
    let days = (secs / 86_400) as i64;
    let rem = secs % 86_400;
    let hour = rem / 3_600;
    let minute = (rem % 3_600) / 60;
    let second = rem % 60;
    let (year, month, day) = civil_from_days(days);
    Ok(format!("{year:04}{month:02}{day:02}-{hour:02}{minute:02}{second:02}"))
}

/// Days since the Unix epoch to a civil UTC date.
/// Howard Hinnant's public-domain `civil_from_days` algorithm.
fn civil_from_days(days_since_epoch: i64) -> (i32, u32, u32) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let year_of_era = yoe as i64;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let month = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    let year = (if month <= 2 {
        year_of_era + era * 400 + 1
    } else {
        year_of_era + era * 400
    }) as i32;
    (year, month, day)
}

#[cfg(test)]
mod tests {
    use super::civil_from_days;

    #[test]
    fn unix_epoch_is_1970() {
        assert_eq!(civil_from_days(0), (1970, 1, 1));
        assert_eq!(civil_from_days(1), (1970, 1, 2));
        assert_eq!(civil_from_days(365), (1971, 1, 1));
    }
}
