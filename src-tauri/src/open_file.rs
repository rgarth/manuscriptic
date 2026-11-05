#[tauri::command]
pub fn open_compiled(path: String) -> Result<(), String> {
    open_with_system(&path)
}

#[cfg(target_os = "macos")]
fn open_with_system(path: &str) -> Result<(), String> {
    let mut command = std::process::Command::new("open");
    command.arg(path);
    run(command)
}

#[cfg(target_os = "windows")]
fn open_with_system(path: &str) -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    let mut command = std::process::Command::new("cmd");
    command.args(["/C", "start", "", path]).creation_flags(CREATE_NO_WINDOW);
    run(command)
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
fn open_with_system(path: &str) -> Result<(), String> {
    let _ = path;
    Err("Opening the compiled file is not supported here.".to_string())
}

fn run(mut command: std::process::Command) -> Result<(), String> {
    let status = command.status().map_err(|err| err.to_string())?;
    if status.success() {
        Ok(())
    } else {
        Err("The compiled file could not be opened.".to_string())
    }
}
