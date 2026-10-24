use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct BookLockRecord {
    computer: String,
    machine_id: String,
    pid: u32,
    holder: String,
    since: i64,
    seen: i64,
}

#[derive(Clone, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum LockState {
    Ours,
    Held { computer: String, since: i64 },
}

enum Classified {
    Free,
    Stale,
    Ours(BookLockRecord),
    Held(BookLockRecord),
}

struct Hold {
    window: String,
    path: String,
    holder: String,
}

static LOCK_IO: Mutex<()> = Mutex::new(());
static HOLDS: Mutex<Vec<Hold>> = Mutex::new(Vec::new());

#[tauri::command]
pub fn claim_book_lock(app: AppHandle, window: tauri::WebviewWindow, path: String, holder: String) -> Result<LockState, String> {
    let _guard = lock_io();
    let state = claim_with(
        Path::new(&path),
        &holder,
        &machine_id(&app)?,
        std::process::id(),
        &computer_name(),
        now_ms(),
        process_alive,
    )?;
    if matches!(state, LockState::Ours) {
        remember(window.label(), &path, &holder);
    }
    Ok(state)
}

#[tauri::command]
pub fn take_book_lock(app: AppHandle, window: tauri::WebviewWindow, path: String, holder: String) -> Result<LockState, String> {
    let _guard = lock_io();
    write_lock(
        Path::new(&path),
        &holder,
        &machine_id(&app)?,
        std::process::id(),
        &computer_name(),
        now_ms(),
        now_ms(),
    )?;
    remember(window.label(), &path, &holder);
    Ok(LockState::Ours)
}

#[tauri::command]
pub fn refresh_book_lock(path: String, holder: String) -> Result<bool, String> {
    let _guard = lock_io();
    let lock_path = lock_path(Path::new(&path));
    let Some(mut record) = read_lock(&lock_path) else {
        return Ok(false);
    };
    if record.holder != holder {
        return Ok(false);
    }
    record.seen = now_ms();
    write_record(&lock_path, &record)?;
    Ok(true)
}

#[tauri::command]
pub fn raise_book_window(app: AppHandle, path: String) -> Result<bool, String> {
    let labels = {
        let held = holds();
        labels_for_book(&held, &path)
    };
    for label in labels {
        let Some(window) = app.get_webview_window(&label) else {
            continue;
        };
        window.unminimize().map_err(|err| err.to_string())?;
        window.set_focus().map_err(|err| err.to_string())?;
        return Ok(true);
    }
    Ok(false)
}

#[tauri::command]
pub fn book_is_open(app: AppHandle, path: String) -> Result<bool, String> {
    let open_here = {
        let held = holds();
        labels_for_book(&held, &path)
            .into_iter()
            .any(|label| app.get_webview_window(&label).is_some())
    };
    if open_here {
        return Ok(true);
    }
    let machine = machine_id(&app)?;
    for lock in lock_candidates(Path::new(&path)) {
        if live_lock(read_lock(&lock).as_ref(), &machine, process_alive) {
            return Ok(true);
        }
    }
    Ok(false)
}

#[tauri::command]
pub fn release_book_lock(window: tauri::WebviewWindow, path: String, holder: String) -> Result<(), String> {
    let _guard = lock_io();
    forget(window.label(), &path);
    release_holder(Path::new(&path), &holder)
}

pub fn release_window(label: &str) {
    let _guard = lock_io();
    let gone = {
        let mut holds = holds();
        let (gone, kept) = std::mem::take(&mut *holds)
            .into_iter()
            .partition::<Vec<_>, _>(|hold| hold.window == label);
        *holds = kept;
        gone
    };
    for hold in gone {
        let _ = release_holder(Path::new(&hold.path), &hold.holder);
    }
}

fn claim_with(
    book: &Path,
    holder: &str,
    machine_id: &str,
    pid: u32,
    computer: &str,
    now: i64,
    alive: impl Fn(u32) -> bool,
) -> Result<LockState, String> {
    let path = lock_path(book);
    let record = read_lock(&path);
    match classify(record.as_ref(), machine_id, holder, alive) {
        Classified::Free | Classified::Stale => {
            write_lock(book, holder, machine_id, pid, computer, now, now)?;
            Ok(LockState::Ours)
        }
        Classified::Ours(mut current) => {
            current.seen = now;
            write_record(&path, &current)?;
            Ok(LockState::Ours)
        }
        Classified::Held(current) => Ok(LockState::Held {
            computer: current.computer,
            since: current.since,
        }),
    }
}

fn classify(
    record: Option<&BookLockRecord>,
    machine_id: &str,
    holder: &str,
    alive: impl Fn(u32) -> bool,
) -> Classified {
    let Some(record) = record else {
        return Classified::Free;
    };
    if record.holder == holder {
        return Classified::Ours(record.clone());
    }
    if record.machine_id == machine_id && !alive(record.pid) {
        return Classified::Stale;
    }
    Classified::Held(record.clone())
}

fn write_lock(
    book: &Path,
    holder: &str,
    machine_id: &str,
    pid: u32,
    computer: &str,
    since: i64,
    seen: i64,
) -> Result<(), String> {
    let record = BookLockRecord {
        computer: computer.to_string(),
        machine_id: machine_id.to_string(),
        pid,
        holder: holder.to_string(),
        since,
        seen,
    };
    write_record(&lock_path(book), &record)
}

fn write_record(path: &Path, record: &BookLockRecord) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
    }
    let text = serde_json::to_string(record).map_err(|err| err.to_string())?;
    let temporary = temp_path(path);
    {
        let mut file = OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&temporary)
            .map_err(|err| err.to_string())?;
        file.write_all(text.as_bytes()).map_err(|err| err.to_string())?;
    }
    fs::rename(&temporary, path).map_err(|err| err.to_string())
}

fn read_lock(path: &Path) -> Option<BookLockRecord> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

fn release_holder(book: &Path, holder: &str) -> Result<(), String> {
    let path = lock_path(book);
    if read_lock(&path).is_some_and(|record| record.holder == holder) {
        fs::remove_file(path).map_err(|err| err.to_string())?;
    }
    Ok(())
}

fn live_lock(record: Option<&BookLockRecord>, machine_id: &str, alive: impl Fn(u32) -> bool) -> bool {
    let Some(record) = record else {
        return false;
    };
    record.machine_id != machine_id || alive(record.pid)
}

fn lock_candidates(book: &Path) -> Vec<PathBuf> {
    let mut paths = vec![lock_path(book)];
    if let Ok(canonical) = book.canonicalize() {
        let beside = lock_path(&canonical);
        if beside != paths[0] {
            paths.push(beside);
        }
    }
    paths
}

fn lock_path(book: &Path) -> PathBuf {
    let mut name = book.file_name().unwrap_or_default().to_os_string();
    name.push(".lock");
    book.with_file_name(name)
}

fn temp_path(target: &Path) -> PathBuf {
    let mut temporary = target.as_os_str().to_owned();
    temporary.push(".tmp");
    PathBuf::from(temporary)
}

fn remember(window: &str, path: &str, holder: &str) {
    let mut holds = holds();
    holds.retain(|hold| hold.window != window || hold.path != path);
    holds.push(Hold {
        window: window.to_string(),
        path: path.to_string(),
        holder: holder.to_string(),
    });
}

fn labels_for_book(holds: &[Hold], path: &str) -> Vec<String> {
    holds
        .iter()
        .rev()
        .filter(|hold| same_book(&hold.path, path))
        .map(|hold| hold.window.clone())
        .collect()
}

fn same_book(held: &str, asked: &str) -> bool {
    if held == asked {
        return true;
    }
    match (std::fs::canonicalize(held), std::fs::canonicalize(asked)) {
        (Ok(left), Ok(right)) => left == right,
        _ => false,
    }
}

fn forget(window: &str, path: &str) {
    holds().retain(|hold| hold.window != window || hold.path != path);
}

fn holds() -> std::sync::MutexGuard<'static, Vec<Hold>> {
    HOLDS.lock().unwrap_or_else(|err| err.into_inner())
}

fn lock_io() -> std::sync::MutexGuard<'static, ()> {
    LOCK_IO.lock().unwrap_or_else(|err| err.into_inner())
}

fn machine_id(app: &AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    let path = dir.join("machine-id");
    if let Ok(text) = fs::read_to_string(&path) {
        let trimmed = text.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    let id = format!("{:x}", now_ms());
    fs::write(&path, &id).map_err(|err| err.to_string())?;
    Ok(id)
}

fn computer_name() -> String {
    command_line("scutil", &["--get", "ComputerName"])
        .or_else(|| command_line("hostname", &[]))
        .unwrap_or_else(|| "This computer".to_string())
}

fn command_line(command: &str, args: &[&str]) -> Option<String> {
    let output = std::process::Command::new(command).args(args).output().ok()?;
    if !output.status.success() {
        return None;
    }
    let name = String::from_utf8(output.stdout).ok()?;
    let name = name.trim();
    if name.is_empty() {
        None
    } else {
        Some(name.to_string())
    }
}

fn process_alive(pid: u32) -> bool {
    if pid == 0 {
        return false;
    }
    std::process::Command::new("ps")
        .args(["-p", &pid.to_string()])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::{
        claim_with, classify, labels_for_book, live_lock, lock_path, release_holder, write_lock, BookLockRecord,
        Classified, Hold,
    };
    use std::fs;

    #[test]
    fn the_lock_sits_beside_the_book() {
        let path = lock_path(std::path::Path::new("/Novels/Castus.manuscriptic"));
        assert_eq!(path, std::path::PathBuf::from("/Novels/Castus.manuscriptic.lock"));
    }

    #[test]
    fn a_dead_lock_from_this_machine_is_a_crash() {
        let record = sample("holder-a", "machine", 40, 1_000);
        let class = classify(Some(&record), "machine", "holder-b", |_| false);
        assert!(matches!(class, Classified::Stale));
    }

    #[test]
    fn an_hour_old_lock_from_another_computer_is_not_taken() {
        let dir = std::env::temp_dir().join(format!("manuscriptic-lock-old-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let book = dir.join("Castus.manuscriptic");
        write_lock(&book, "holder-a", "other", 40, "Kitchen", 5_000, 5_000).unwrap();
        let hour_later = 5_000 + 60 * 60 * 1000;
        let held = claim_with(&book, "holder-b", "machine", 9, "Desk", hour_later, |_| true).unwrap();
        assert!(matches!(held, super::LockState::Held { computer, .. } if computer == "Kitchen"));
        let still = fs::read_to_string(lock_path(&book)).unwrap();
        assert!(still.contains("holder-a"));
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn claim_refuses_a_live_lock_and_take_is_separate() {
        let dir = std::env::temp_dir().join(format!("manuscriptic-lock-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let book = dir.join("Castus.manuscriptic");
        write_lock(&book, "holder-a", "other", 40, "Kitchen", 5_000, 5_000).unwrap();
        let refused = claim_with(&book, "holder-b", "machine", 9, "Desk", 6_000, |_| true).unwrap();
        assert!(matches!(refused, super::LockState::Held { computer, .. } if computer == "Kitchen"));
        let still = fs::read_to_string(lock_path(&book)).unwrap();
        assert!(still.contains("holder-a"));
        let crashed = claim_with(&book, "holder-b", "other", 9, "Desk", 6_000, |_| false).unwrap();
        assert!(matches!(crashed, super::LockState::Ours));
        release_holder(&book, "holder-b").unwrap();
        assert!(!lock_path(&book).exists());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_book_open_in_this_app_is_the_window_to_raise() {
        let dir = std::env::temp_dir().join(format!("manuscriptic-raise-{}", std::process::id()));
        fs::create_dir_all(&dir).unwrap();
        let book = dir.join("Castus.manuscriptic");
        fs::write(&book, "").unwrap();
        let link = dir.join("link.manuscriptic");
        std::os::unix::fs::symlink(&book, &link).unwrap();
        let book_path = book.to_string_lossy().to_string();
        let holds = vec![
            Hold {
                window: "main".into(),
                path: link.to_string_lossy().into(),
                holder: "h".into(),
            },
            Hold {
                window: "book-later".into(),
                path: book_path.clone(),
                holder: "h".into(),
            },
        ];
        assert_eq!(labels_for_book(&holds, &book_path), vec!["book-later".to_string(), "main".to_string()]);
        assert!(labels_for_book(&holds, "/Novels/Missing.manuscriptic").is_empty());
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn a_live_lock_blocks_a_new_book_and_a_dead_one_does_not() {
        let live = sample("holder-a", "machine", 40, 1_000);
        assert!(live_lock(Some(&live), "machine", |_| true));
        assert!(!live_lock(Some(&live), "machine", |_| false));
        assert!(live_lock(Some(&live), "other", |_| false));
        assert!(!live_lock(None, "machine", |_| true));
    }

    fn sample(holder: &str, machine: &str, pid: u32, seen: i64) -> BookLockRecord {
        BookLockRecord {
            computer: "Kitchen".to_string(),
            machine_id: machine.to_string(),
            pid,
            holder: holder.to_string(),
            since: seen,
            seen,
        }
    }
}
