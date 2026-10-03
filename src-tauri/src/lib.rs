mod database;
mod error;
mod secrets;
mod worker;
mod workspace;

use std::fs;

use database::{
    AiTaskRecord, CandidateRecord, ChapterDraftRecord, ChapterVersionRecord,
    ConsistencyReportRecord, ContextSnapshotRecord, CreateAiTaskInput, CreateCandidateInput,
    CreateContextSnapshotInput, CreateProjectInput, DatabaseState, ImportedSourceRecord,
    ProjectCheckpointRecord, ProjectRecord, RenameProjectInput, SaveChapterDraftInput,
    SaveConsistencyReportInput, SaveSourceAnalysisInput, SaveStoryBibleInput, SearchHitRecord,
    SourceAnalysisRecord, StoryBibleRecord, UpdateAiTaskInput,
};
use error::{CommandError, CommandResult};
use serde::Serialize;
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};
use uuid::Uuid;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopHealth {
    ok: bool,
    app_version: &'static str,
    storage: &'static str,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportProgress {
    pub active: bool,
    pub percent: u8,
    pub phase: String,
}

pub struct ImportState {
    pub cancelled: Arc<AtomicBool>,
    pub progress: Arc<Mutex<ImportProgress>>,
}

#[tauri::command]
fn desktop_health() -> DesktopHealth {
    DesktopHealth {
        ok: true,
        app_version: env!("CARGO_PKG_VERSION"),
        storage: "sqlite-wal",
    }
}

#[tauri::command]
fn secure_store_health() -> secrets::SecureStoreHealth {
    secrets::health()
}

#[tauri::command]
fn save_api_key(provider_id: String, api_key: String) -> CommandResult<()> {
    secrets::save(&provider_id, &api_key).map_err(CommandError::from)
}

#[tauri::command]
fn load_api_key(provider_id: String) -> CommandResult<Option<String>> {
    secrets::load(&provider_id).map_err(CommandError::from)
}

#[tauri::command]
fn delete_api_key(provider_id: String) -> CommandResult<()> {
    secrets::delete(&provider_id).map_err(CommandError::from)
}

#[tauri::command]
fn write_export_file(path: String, bytes: Vec<u8>) -> CommandResult<()> {
    workspace::write_export_file(std::path::Path::new(&path), &bytes).map_err(CommandError::from)
}

#[tauri::command]
fn read_project_package(path: String) -> CommandResult<Vec<u8>> {
    workspace::read_project_package(std::path::Path::new(&path)).map_err(CommandError::from)
}

#[tauri::command]
fn create_project_checkpoint(
    project_id: String,
    name: String,
    bytes: Vec<u8>,
    database: State<'_, DatabaseState>,
    workspace_state: State<'_, workspace::WorkspaceState>,
) -> CommandResult<ProjectCheckpointRecord> {
    let checkpoint_id = Uuid::new_v4().to_string();
    let path = workspace::write_project_checkpoint(
        &workspace_state.root,
        &project_id,
        &checkpoint_id,
        &bytes,
    )
    .map_err(CommandError::from)?;
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    match database::create_project_checkpoint(
        &connection,
        &project_id,
        &checkpoint_id,
        &name,
        &path,
        bytes.len() as i64,
    ) {
        Ok(record) => Ok(record),
        Err(error) => {
            workspace::remove_checkpoint_file(&path);
            Err(CommandError::from(error))
        }
    }
}

#[tauri::command]
fn list_project_checkpoints(
    project_id: String,
    database: State<'_, DatabaseState>,
) -> CommandResult<Vec<ProjectCheckpointRecord>> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::list_project_checkpoints(&connection, &project_id).map_err(CommandError::from)
}

#[tauri::command]
fn read_project_checkpoint(
    checkpoint_id: String,
    database: State<'_, DatabaseState>,
    workspace_state: State<'_, workspace::WorkspaceState>,
) -> CommandResult<Vec<u8>> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    let raw_path = database::get_project_checkpoint_path(&connection, &checkpoint_id)
        .map_err(CommandError::from)?;
    let path = std::path::Path::new(&raw_path);
    if !path.starts_with(workspace_state.root.join("projects")) {
        return Err(CommandError::from(error::DesktopError::Validation(
            "检查点路径超出项目目录".into(),
        )));
    }
    workspace::read_project_package(path).map_err(CommandError::from)
}

#[tauri::command]
fn create_project(
    input: CreateProjectInput,
    database: State<'_, DatabaseState>,
) -> CommandResult<ProjectRecord> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::create_project(&connection, input).map_err(CommandError::from)
}

#[tauri::command]
fn list_projects(database: State<'_, DatabaseState>) -> CommandResult<Vec<ProjectRecord>> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::list_projects(&connection).map_err(CommandError::from)
}

#[tauri::command]
fn list_trashed_projects(database: State<'_, DatabaseState>) -> CommandResult<Vec<ProjectRecord>> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::list_trashed_projects(&connection).map_err(CommandError::from)
}

#[tauri::command]
fn trash_project(
    project_id: String,
    database: State<'_, DatabaseState>,
) -> CommandResult<ProjectRecord> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::trash_project(&connection, &project_id).map_err(CommandError::from)
}

#[tauri::command]
fn restore_trashed_project(
    project_id: String,
    database: State<'_, DatabaseState>,
) -> CommandResult<ProjectRecord> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::restore_trashed_project(&connection, &project_id).map_err(CommandError::from)
}

#[tauri::command]
fn rename_project(
    input: RenameProjectInput,
    database: State<'_, DatabaseState>,
) -> CommandResult<ProjectRecord> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::rename_project(&connection, input).map_err(CommandError::from)
}

#[tauri::command]
fn set_project_status(
    project_id: String,
    status: String,
    database: State<'_, DatabaseState>,
) -> CommandResult<ProjectRecord> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::set_project_status(&connection, &project_id, &status).map_err(CommandError::from)
}

#[tauri::command]
fn duplicate_project(
    project_id: String,
    title: Option<String>,
    database: State<'_, DatabaseState>,
    workspace_state: State<'_, workspace::WorkspaceState>,
) -> CommandResult<ProjectRecord> {
    let mut connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    let record = database::duplicate_project(&mut connection, &project_id, title.as_deref())
        .map_err(CommandError::from)?;
    let source_count =
        database::project_source_count(&connection, &record.id).map_err(CommandError::from)?;
    if source_count > 0 {
        let sources_directory = match workspace::duplicate_project_sources(
            &workspace_state.root,
            &project_id,
            &record.id,
        ) {
            Ok(path) => path,
            Err(error) => {
                let _ = database::purge_project_after_failed_copy(&connection, &record.id);
                return Err(CommandError::from(error));
            }
        };
        if let Err(error) =
            database::rebase_project_source_paths(&connection, &record.id, &sources_directory)
        {
            workspace::remove_project_directory(&workspace_state.root, &record.id);
            let _ = database::purge_project_after_failed_copy(&connection, &record.id);
            return Err(CommandError::from(error));
        }
    }
    Ok(record)
}

#[tauri::command]
async fn parse_document(path: String, project_id: String) -> CommandResult<Value> {
    tauri::async_runtime::spawn_blocking(move || worker::parse_document(&path, &project_id))
        .await
        .map_err(|error| {
            CommandError::from(error::DesktopError::Worker(format!(
                "Worker 线程失败：{error}"
            )))
        })?
        .map_err(CommandError::from)
}

#[tauri::command]
async fn import_document(
    path: String,
    project_id: String,
    rights_confirmed: bool,
    database: State<'_, DatabaseState>,
    workspace: State<'_, workspace::WorkspaceState>,
    import_state: State<'_, ImportState>,
) -> CommandResult<ImportedSourceRecord> {
    if !rights_confirmed {
        return Err(CommandError::from(error::DesktopError::Validation(
            "导入前必须确认拥有合法使用或改编权".into(),
        )));
    }
    let worker_path = path.clone();
    let worker_project_id = project_id.clone();
    import_state.cancelled.store(false, Ordering::Relaxed);
    if let Ok(mut progress) = import_state.progress.lock() {
        progress.active = true;
        progress.percent = 0;
        progress.phase = "准备导入".into();
    }
    let cancelled = Arc::clone(&import_state.cancelled);
    let progress_state = Arc::clone(&import_state.progress);
    let observer = Arc::new(move |line: &str| {
        let Some(payload) = line.strip_prefix("PROGRESS\t") else { return; };
        let mut parts = payload.splitn(2, '\t');
        let phase = parts.next().unwrap_or("处理中");
        let percent = parts.next().and_then(|value| value.parse::<u8>().ok()).unwrap_or(0).min(100);
        if let Ok(mut progress) = progress_state.lock() {
            progress.phase = phase.to_owned();
            progress.percent = percent;
        }
    });
    let payload_result = tauri::async_runtime::spawn_blocking(move || {
        worker::parse_document_with_observer(&worker_path, &worker_project_id, &cancelled, Some(observer))
    })
    .await
    .map_err(|error| {
        CommandError::from(error::DesktopError::Worker(format!(
            "Worker 线程失败：{error}"
        )))
    })?;
    let payload = match payload_result {
        Ok(payload) => payload,
        Err(error) => {
            if let Ok(mut progress) = import_state.progress.lock() {
                progress.active = false;
                progress.phase = error.to_string();
            }
            return Err(CommandError::from(error));
        }
    };
    let preserved_path = workspace::preserve_source_file(
        &workspace.root,
        std::path::Path::new(&path),
        &project_id,
        &payload,
    ).map_err(|error| {
        if let Ok(mut progress) = import_state.progress.lock() { progress.active = false; progress.phase = error.to_string(); }
        CommandError::from(error)
    })?;
    let mut connection = database.0.lock().map_err(|_| {
        if let Ok(mut progress) = import_state.progress.lock() { progress.active = false; progress.phase = "数据库锁定失败".into(); }
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    let saved = database::persist_worker_import(
        &mut connection,
        payload,
        &preserved_path.to_string_lossy(),
        rights_confirmed,
    ).map_err(|error| {
        if let Ok(mut progress) = import_state.progress.lock() { progress.active = false; progress.phase = error.to_string(); }
        CommandError::from(error)
    })?;
    if let Ok(mut progress) = import_state.progress.lock() {
        progress.active = false;
        progress.percent = 100;
        progress.phase = "导入完成".into();
    }
    Ok(saved)
}

#[tauri::command]
fn cancel_import(import_state: State<'_, ImportState>) -> CommandResult<()> {
    import_state.cancelled.store(true, Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
fn import_progress(import_state: State<'_, ImportState>) -> ImportProgress {
    import_state.progress.lock().map(|progress| progress.clone()).unwrap_or(ImportProgress { active: false, percent: 0, phase: "未知".into() })
}

#[tauri::command]
fn restore_source_snapshot(
    project_id: String,
    source_snapshot: Value,
    database: State<'_, DatabaseState>,
    workspace_state: State<'_, workspace::WorkspaceState>,
) -> CommandResult<ImportedSourceRecord> {
    let sha256 = source_snapshot
        .pointer("/document/sha256")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            CommandError::from(error::DesktopError::Validation("项目包原文缺少哈希".into()))
        })?;
    let original_text = source_snapshot
        .pointer("/document/originalText")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            CommandError::from(error::DesktopError::Validation(
                "项目包原文缺少正文快照".into(),
            ))
        })?;
    let restored_path =
        workspace::restore_source_text(&workspace_state.root, &project_id, sha256, original_text)
            .map_err(CommandError::from)?;
    let mut connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::restore_source_snapshot(
        &mut connection,
        &project_id,
        source_snapshot,
        &restored_path.to_string_lossy(),
    )
    .map_err(CommandError::from)
}

#[tauri::command]
fn revise_source_snapshot(
    source_snapshot: Value,
    reason: String,
    database: State<'_, DatabaseState>,
) -> CommandResult<ImportedSourceRecord> {
    let mut connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::revise_source_snapshot(&mut connection, source_snapshot, &reason)
        .map_err(CommandError::from)
}

#[tauri::command]
fn list_imported_sources(
    project_id: String,
    database: State<'_, DatabaseState>,
) -> CommandResult<Vec<ImportedSourceRecord>> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::list_imported_sources(&connection, &project_id).map_err(CommandError::from)
}

#[tauri::command]
fn create_ai_candidate(
    input: CreateCandidateInput,
    database: State<'_, DatabaseState>,
) -> CommandResult<CandidateRecord> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::create_candidate(&connection, input).map_err(CommandError::from)
}

#[tauri::command]
fn list_ai_candidates(
    project_id: String,
    kind: Option<String>,
    database: State<'_, DatabaseState>,
) -> CommandResult<Vec<CandidateRecord>> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::list_candidates(&connection, &project_id, kind.as_deref()).map_err(CommandError::from)
}

#[tauri::command]
fn accept_ai_candidate(
    candidate_id: String,
    database: State<'_, DatabaseState>,
) -> CommandResult<StoryBibleRecord> {
    let mut connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::accept_candidate(&mut connection, &candidate_id).map_err(CommandError::from)
}

#[tauri::command]
fn reject_ai_candidate(
    candidate_id: String,
    database: State<'_, DatabaseState>,
) -> CommandResult<()> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::reject_candidate(&connection, &candidate_id).map_err(CommandError::from)
}

#[tauri::command]
fn list_story_bible(
    project_id: String,
    database: State<'_, DatabaseState>,
) -> CommandResult<Vec<StoryBibleRecord>> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::list_story_bible(&connection, &project_id).map_err(CommandError::from)
}

#[tauri::command]
fn save_story_bible(
    input: SaveStoryBibleInput,
    database: State<'_, DatabaseState>,
) -> CommandResult<StoryBibleRecord> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::save_story_bible(&connection, input).map_err(CommandError::from)
}

#[tauri::command]
fn search_source_segments(
    project_id: String,
    query: String,
    limit: Option<i64>,
    database: State<'_, DatabaseState>,
) -> CommandResult<Vec<SearchHitRecord>> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::search_source_segments(&connection, &project_id, &query, limit.unwrap_or(20))
        .map_err(CommandError::from)
}

#[tauri::command]
fn save_source_analysis(
    input: SaveSourceAnalysisInput,
    database: State<'_, DatabaseState>,
) -> CommandResult<SourceAnalysisRecord> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::save_source_analysis(&connection, input).map_err(CommandError::from)
}

#[tauri::command]
fn list_source_analysis(
    source_document_id: String,
    database: State<'_, DatabaseState>,
) -> CommandResult<Vec<SourceAnalysisRecord>> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::list_source_analysis(&connection, &source_document_id).map_err(CommandError::from)
}

#[tauri::command]
fn set_source_analysis_status(
    analysis_id: String,
    status: String,
    database: State<'_, DatabaseState>,
) -> CommandResult<SourceAnalysisRecord> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::set_source_analysis_status(&connection, &analysis_id, &status)
        .map_err(CommandError::from)
}

#[tauri::command]
fn create_ai_task(
    input: CreateAiTaskInput,
    database: State<'_, DatabaseState>,
) -> CommandResult<AiTaskRecord> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::create_ai_task(&connection, input).map_err(CommandError::from)
}

#[tauri::command]
fn update_ai_task(
    input: UpdateAiTaskInput,
    database: State<'_, DatabaseState>,
) -> CommandResult<AiTaskRecord> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::update_ai_task(&connection, input).map_err(CommandError::from)
}

#[tauri::command]
fn list_ai_tasks(
    project_id: String,
    database: State<'_, DatabaseState>,
) -> CommandResult<Vec<AiTaskRecord>> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::list_ai_tasks(&connection, &project_id).map_err(CommandError::from)
}

#[tauri::command]
fn save_chapter_draft(
    input: SaveChapterDraftInput,
    database: State<'_, DatabaseState>,
) -> CommandResult<ChapterDraftRecord> {
    let mut connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::save_chapter_draft(&mut connection, input).map_err(CommandError::from)
}

#[tauri::command]
fn list_chapter_drafts(
    project_id: String,
    database: State<'_, DatabaseState>,
) -> CommandResult<Vec<ChapterDraftRecord>> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::list_chapter_drafts(&connection, &project_id).map_err(CommandError::from)
}

#[tauri::command]
fn list_chapter_versions(
    chapter_document_id: String,
    database: State<'_, DatabaseState>,
) -> CommandResult<Vec<ChapterVersionRecord>> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::list_chapter_versions(&connection, &chapter_document_id).map_err(CommandError::from)
}

#[tauri::command]
fn set_chapter_status(
    chapter_document_id: String,
    status: String,
    database: State<'_, DatabaseState>,
) -> CommandResult<ChapterDraftRecord> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::set_chapter_status(&connection, &chapter_document_id, &status)
        .map_err(CommandError::from)
}

#[tauri::command]
fn create_context_snapshot(
    input: CreateContextSnapshotInput,
    database: State<'_, DatabaseState>,
) -> CommandResult<ContextSnapshotRecord> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::create_context_snapshot(&connection, input).map_err(CommandError::from)
}

#[tauri::command]
fn list_context_snapshots(
    project_id: String,
    scope_id: Option<String>,
    database: State<'_, DatabaseState>,
) -> CommandResult<Vec<ContextSnapshotRecord>> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::list_context_snapshots(&connection, &project_id, scope_id.as_deref())
        .map_err(CommandError::from)
}

#[tauri::command]
fn save_consistency_report(
    input: SaveConsistencyReportInput,
    database: State<'_, DatabaseState>,
) -> CommandResult<ConsistencyReportRecord> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::save_consistency_report(&connection, input).map_err(CommandError::from)
}

#[tauri::command]
fn list_consistency_reports(
    project_id: String,
    chapter_plan_id: String,
    database: State<'_, DatabaseState>,
) -> CommandResult<Vec<ConsistencyReportRecord>> {
    let connection = database.0.lock().map_err(|_| {
        CommandError::from(error::DesktopError::Database(rusqlite::Error::InvalidQuery))
    })?;
    database::list_consistency_reports(&connection, &project_id, &chapter_plan_id)
        .map_err(CommandError::from)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&data_dir)?;
            let connection = database::open_database(&data_dir.join("story-rewriter.sqlite"))
                .map_err(|error| Box::<dyn std::error::Error>::from(error))?;
            app.manage(DatabaseState(std::sync::Mutex::new(connection)));
            app.manage(workspace::WorkspaceState { root: data_dir });
            app.manage(ImportState {
                cancelled: Arc::new(AtomicBool::new(false)),
                progress: Arc::new(Mutex::new(ImportProgress { active: false, percent: 0, phase: "空闲".into() })),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_health,
            secure_store_health,
            save_api_key,
            load_api_key,
            delete_api_key,
            write_export_file,
            read_project_package,
            create_project_checkpoint,
            list_project_checkpoints,
            read_project_checkpoint,
            create_project,
            list_projects,
            list_trashed_projects,
            trash_project,
            restore_trashed_project,
            rename_project,
            set_project_status,
            duplicate_project,
            parse_document,
            import_document,
            cancel_import,
            import_progress,
            restore_source_snapshot,
            revise_source_snapshot,
            list_imported_sources,
            create_ai_candidate,
            list_ai_candidates,
            accept_ai_candidate,
            reject_ai_candidate,
            list_story_bible,
            save_story_bible,
            search_source_segments,
            save_source_analysis,
            list_source_analysis,
            set_source_analysis_status,
            create_ai_task,
            update_ai_task,
            list_ai_tasks,
            save_chapter_draft,
            list_chapter_drafts,
            list_chapter_versions,
            set_chapter_status,
            create_context_snapshot,
            list_context_snapshots,
            save_consistency_report,
            list_consistency_reports
        ])
        .run(tauri::generate_context!())
        .expect("failed to run story rewriter desktop application");
}
