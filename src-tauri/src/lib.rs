mod book_file;
mod book_lock;
mod documents;
mod fonts;
mod scrivener;
mod spellcheck;

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Condvar, Mutex};

use book_file::{file_exists, read_book, read_history, write_book, write_export};
use scrivener::read_scrivener;
use book_lock::{
    book_is_open, claim_book_lock, holds_book, raise_book_window, refresh_book_lock, release_book_lock,
    release_window, reserve_book, take_book_lock,
};
use documents::documents_directory;
use fonts::list_fonts;
use spellcheck::{misspellings, spelling_suggestions};
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};

static BOOK_WINDOWS: AtomicU64 = AtomicU64::new(1);

struct Launch {
    settled: bool,
    paths: Vec<String>,
}

static LAUNCH: Mutex<Launch> = Mutex::new(Launch {
    settled: false,
    paths: Vec::new(),
});
static LAUNCH_READY: Condvar = Condvar::new();

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            list_fonts,
            documents_directory,
            read_book,
            read_history,
            write_book,
            write_export,
            file_exists,
            read_scrivener,
            claim_book_lock,
            raise_book_window,
            book_is_open,
            take_book_lock,
            refresh_book_lock,
            release_book_lock,
            misspellings,
            spelling_suggestions,
            launch_books
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let label = window.label().to_string();
                release_window(&label);
                let app = window.app_handle();
                let others = app.webview_windows().keys().any(|open| open != &label);
                if !others {
                    app.exit(0);
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| open_requested_books(app, event));
}

fn open_requested_books(app: &tauri::AppHandle, event: tauri::RunEvent) {
    match event {
        tauri::RunEvent::MainEventsCleared => settle_launch(),
        #[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
        tauri::RunEvent::Opened { urls } => note_or_open(app, urls),
        _ => {}
    }
}

fn settle_launch() {
    // Finder's open callback arrives before the run loop goes idle, so this event means the launch list is complete.
    let mut launch = LAUNCH.lock().unwrap_or_else(|err| err.into_inner());
    if launch.settled {
        return;
    }
    launch.settled = true;
    LAUNCH_READY.notify_all();
}

#[tauri::command]
async fn launch_books() -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(wait_for_launch)
        .await
        .map_err(|err| err.to_string())
}

fn wait_for_launch() -> Vec<String> {
    let mut launch = LAUNCH.lock().unwrap_or_else(|err| err.into_inner());
    while !launch.settled {
        launch = LAUNCH_READY.wait(launch).unwrap_or_else(|err| err.into_inner());
    }
    launch.paths.clone()
}

fn remember_launch(paths: &mut Vec<String>, path: &str) {
    if !paths.iter().any(|have| have == path) {
        paths.push(path.to_string());
    }
}

fn opened_book(url: &tauri::Url) -> Option<String> {
    let path = url.to_file_path().ok()?;
    let extension = path.extension().and_then(|item| item.to_str())?;
    if !extension.eq_ignore_ascii_case("manuscriptic") {
        return None;
    }
    Some(path.to_string_lossy().into_owned())
}

fn book_page(path: &str) -> String {
    let mut url = tauri::Url::parse("https://manuscriptic.invalid/index.html").expect("book page");
    url.query_pairs_mut().append_pair("book", path);
    format!("index.html?{}", url.query().unwrap_or_default())
}

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
fn note_or_open(app: &tauri::AppHandle, urls: Vec<tauri::Url>) {
    let books: Vec<String> = urls.iter().filter_map(opened_book).collect();
    if books.is_empty() {
        return;
    }
    {
        let mut launch = LAUNCH.lock().unwrap_or_else(|err| err.into_inner());
        if !launch.settled {
            for path in &books {
                remember_launch(&mut launch.paths, path);
            }
            return;
        }
    }
    open_books(app, urls);
}

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
fn open_books(app: &tauri::AppHandle, urls: Vec<tauri::Url>) {
    for url in urls {
        let Some(path) = opened_book(&url) else {
            continue;
        };
        if show_open_book(app, &path) {
            continue;
        }
        if let Err(error) = place_book(app, &path) {
            report_open(app, &path, &error);
        }
    }
}

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
fn show_open_book(app: &tauri::AppHandle, path: &str) -> bool {
    match raise_book_window(app.clone(), path.to_string()) {
        Ok(false) => false,
        Ok(true) => true,
        Err(error) => {
            report_open(app, path, &error);
            true
        }
    }
}

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
fn place_book(app: &tauri::AppHandle, path: &str) -> Result<(), String> {
    if let Some(window) = idle_window(app) {
        if let Some(url) = book_location(&window, path) {
            window.navigate(url).map_err(|err| err.to_string())?;
            let _ = window.unminimize();
            let _ = window.set_focus();
            reserve_book(window.label(), path);
            return Ok(());
        }
    }
    create_book_window(app, path)
}

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
fn book_location(window: &tauri::WebviewWindow, path: &str) -> Option<tauri::Url> {
    let mut url = window.url().ok()?;
    if url.scheme() != "http" && url.scheme() != "https" && url.scheme() != "tauri" {
        return None;
    }
    url.query_pairs_mut().clear().append_pair("book", path);
    Some(url)
}

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
fn idle_window(app: &tauri::AppHandle) -> Option<tauri::WebviewWindow> {
    let windows = app.webview_windows();
    let mut labels: Vec<String> = windows.keys().cloned().collect();
    labels.sort_by_key(|label| label != "main");
    labels.into_iter().find_map(|label| {
        if holds_book(&label) {
            return None;
        }
        let window = windows.get(&label)?.clone();
        match window.url() {
            Ok(url) if url.query_pairs().all(|(key, _)| key != "book") => Some(window),
            _ => None,
        }
    })
}

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
fn create_book_window(app: &tauri::AppHandle, path: &str) -> Result<(), String> {
    let mut config = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .ok_or_else(|| "The app has no window.".to_string())?;
    config.label = format!("book-{}", BOOK_WINDOWS.fetch_add(1, Ordering::Relaxed));
    config.url = tauri::WebviewUrl::App(std::path::PathBuf::from(book_page(path)));
    let label = config.label.clone();
    let window = tauri::WebviewWindowBuilder::from_config(app, &config)
        .map_err(|err| err.to_string())?
        .build()
        .map_err(|err| err.to_string())?;
    let _ = window.set_focus();
    reserve_book(&label, path);
    Ok(())
}

#[cfg(any(target_os = "macos", target_os = "ios", target_os = "android"))]
fn report_open(app: &tauri::AppHandle, path: &str, error: &str) {
    app.dialog()
        .message(format!("{path}\n{error}"))
        .title("Could not open the project.")
        .kind(MessageDialogKind::Error)
        .show(|_| {});
}

#[cfg(test)]
mod tests {
    use super::{book_page, opened_book, remember_launch};

    #[test]
    fn a_manuscriptic_file_opens_and_another_file_does_not() {
        let book = tauri::Url::from_file_path("/Novels/Castus.manuscriptic").expect("book");
        assert_eq!(opened_book(&book).as_deref(), Some("/Novels/Castus.manuscriptic"));
        let titled = tauri::Url::from_file_path("/Novels/Castus.MANUSCRIPTIC").expect("titled");
        assert_eq!(opened_book(&titled).as_deref(), Some("/Novels/Castus.MANUSCRIPTIC"));
        let other = tauri::Url::from_file_path("/Novels/notes.txt").expect("other");
        assert_eq!(opened_book(&other), None);
    }

    #[test]
    fn a_book_page_keeps_the_path() {
        let page = book_page("/Novels/My Book.manuscriptic");
        let url = tauri::Url::parse(&format!("https://manuscriptic.invalid/{page}")).expect("page");
        let book = url
            .query_pairs()
            .find(|(key, _)| key == "book")
            .map(|(_, value)| value.into_owned());
        assert_eq!(book.as_deref(), Some("/Novels/My Book.manuscriptic"));
    }

    #[test]
    fn a_launch_file_is_recorded_once() {
        let mut paths = Vec::new();
        remember_launch(&mut paths, "/Novels/Castus.manuscriptic");
        remember_launch(&mut paths, "/Novels/Castus.manuscriptic");
        remember_launch(&mut paths, "/Novels/Other.manuscriptic");
        assert_eq!(
            paths,
            vec![
                "/Novels/Castus.manuscriptic".to_string(),
                "/Novels/Other.manuscriptic".to_string()
            ]
        );
    }
}
