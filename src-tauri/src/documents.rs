use tauri::{AppHandle, Manager};

#[tauri::command]
pub fn documents_directory(app: AppHandle) -> Result<String, String> {
    let path = app.path().document_dir().map_err(|err| err.to_string())?;
    path.into_os_string()
        .into_string()
        .map_err(|_| "Could not find the Documents folder.".to_string())
}
