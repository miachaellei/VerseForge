use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use crate::error::DesktopError;

pub struct DatabaseState(pub Mutex<Connection>);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectInput {
    pub title: String,
    pub genre: String,
    pub language: String,
    pub target_word_count: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameProjectInput {
    pub project_id: String,
    pub title: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub title: String,
    pub genre: String,
    pub language: String,
    pub target_word_count: Option<i64>,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub trashed_at: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerDocument {
    project_id: String,
    file_name: String,
    format: String,
    byte_size: i64,
    sha256: String,
    parser_version: String,
    encoding: Option<String>,
    #[serde(default)]
    original_text: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerChapter {
    id: String,
    ordinal: i64,
    title: String,
    content: String,
    source_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerSegment {
    id: String,
    chapter_id: String,
    ordinal: i64,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerIssue {
    code: String,
    severity: String,
    message: String,
    chapter_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WorkerImport {
    document: WorkerDocument,
    chapters: Vec<WorkerChapter>,
    segments: Vec<WorkerSegment>,
    issues: Vec<WorkerIssue>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupSourceDocument {
    id: String,
    file_name: String,
    format: String,
    byte_size: i64,
    sha256: String,
    parser_version: String,
    encoding: Option<String>,
    original_text: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupSourceChapter {
    id: String,
    ordinal: i64,
    title: String,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupSourceSegment {
    id: String,
    chapter_id: String,
    ordinal: i64,
    content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupSourceIssue {
    code: String,
    severity: String,
    message: String,
    chapter_id: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BackupImportedSource {
    document: BackupSourceDocument,
    chapters: Vec<BackupSourceChapter>,
    segments: Vec<BackupSourceSegment>,
    issues: Vec<BackupSourceIssue>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceDocumentRecord {
    pub id: String,
    pub project_id: String,
    pub file_name: String,
    pub format: String,
    pub byte_size: i64,
    pub sha256: String,
    pub parser_version: String,
    pub encoding: Option<String>,
    pub imported_at: i64,
    pub original_text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceChapterRecord {
    pub id: String,
    pub source_document_id: String,
    pub ordinal: i64,
    pub title: String,
    pub content: String,
    pub start_offset: i64,
    pub end_offset: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSegmentRecord {
    pub id: String,
    pub source_document_id: String,
    pub chapter_id: String,
    pub ordinal: i64,
    pub content: String,
    pub start_offset: i64,
    pub end_offset: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceIssueRecord {
    pub code: String,
    pub severity: String,
    pub message: String,
    pub chapter_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ImportedSourceRecord {
    pub document: SourceDocumentRecord,
    pub chapters: Vec<SourceChapterRecord>,
    pub segments: Vec<SourceSegmentRecord>,
    pub issues: Vec<SourceIssueRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCandidateInput {
    pub project_id: String,
    pub kind: String,
    pub value: Value,
    pub source_snapshot_id: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateRecord {
    pub id: String,
    pub project_id: String,
    pub kind: String,
    pub value: Value,
    pub source_snapshot_id: Option<String>,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoryBibleRecord {
    pub id: String,
    pub project_id: String,
    pub kind: String,
    pub value: Value,
    pub revision: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveStoryBibleInput {
    pub project_id: String,
    pub kind: String,
    pub value: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHitRecord {
    pub segment_id: String,
    pub source_document_id: String,
    pub chapter_id: String,
    pub content: String,
    pub rank: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveSourceAnalysisInput {
    pub project_id: String,
    pub source_document_id: String,
    pub chapter_id: String,
    pub value: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceAnalysisRecord {
    pub id: String,
    pub project_id: String,
    pub source_document_id: String,
    pub chapter_id: String,
    pub value: Value,
    pub status: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAiTaskInput {
    pub id: String,
    pub project_id: String,
    pub kind: String,
    pub provider_id: String,
    pub model: String,
    pub idempotency_key: String,
    pub input_hash: String,
    pub input: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAiTaskInput {
    pub task_id: String,
    pub expected_revision: i64,
    pub status: String,
    pub output: Option<Value>,
    pub error: Option<Value>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub cached_input_tokens: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiTaskRecord {
    pub id: String,
    pub project_id: String,
    pub kind: String,
    pub provider_id: String,
    pub model: String,
    pub status: String,
    pub idempotency_key: String,
    pub input_hash: String,
    pub input: Value,
    pub output: Option<Value>,
    pub error: Option<Value>,
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub cached_input_tokens: Option<i64>,
    pub revision: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveChapterDraftInput {
    pub project_id: String,
    pub chapter_plan_id: String,
    pub title: String,
    pub content: String,
    pub source: String,
    pub expected_revision: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterDraftRecord {
    pub id: String,
    pub project_id: String,
    pub chapter_plan_id: String,
    pub title: String,
    pub content: String,
    pub status: String,
    pub revision: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChapterVersionRecord {
    pub id: String,
    pub chapter_document_id: String,
    pub revision: i64,
    pub title: String,
    pub content: String,
    pub source: String,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateContextSnapshotInput {
    pub id: String,
    pub project_id: String,
    pub scope_kind: String,
    pub scope_id: String,
    pub visible_through_ordinal: Option<i64>,
    pub payload: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSnapshotRecord {
    pub id: String,
    pub project_id: String,
    pub scope_kind: String,
    pub scope_id: String,
    pub visible_through_ordinal: Option<i64>,
    pub payload: Value,
    pub created_at: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveConsistencyReportInput {
    pub project_id: String,
    pub chapter_plan_id: String,
    pub chapter_document_revision: Option<i64>,
    pub report: Value,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsistencyReportRecord {
    pub id: String,
    pub project_id: String,
    pub chapter_plan_id: String,
    pub chapter_document_revision: Option<i64>,
    pub report: Value,
    pub created_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCheckpointRecord {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub byte_size: i64,
    pub created_at: i64,
}

pub fn open_database(path: &Path) -> Result<Connection, DesktopError> {
    let connection = Connection::open(path)?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&connection)?;
    Ok(connection)
}

fn migrate(connection: &Connection) -> Result<(), DesktopError> {
    connection.execute_batch("BEGIN IMMEDIATE")?;
    let result = (|| -> Result<(), DesktopError> {
        connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL CHECK(length(trim(title)) > 0),
          genre TEXT NOT NULL,
          language TEXT NOT NULL,
          target_word_count INTEGER,
          status TEXT NOT NULL CHECK(status IN ('preparing', 'rewriting', 'completed', 'archived')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (1, unixepoch());

        CREATE TABLE IF NOT EXISTS source_documents (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          file_name TEXT NOT NULL,
          format TEXT NOT NULL CHECK(format IN ('txt', 'markdown', 'epub', 'pdf')),
          byte_size INTEGER NOT NULL CHECK(byte_size >= 0),
          sha256 TEXT NOT NULL,
          parser_version TEXT NOT NULL,
          encoding TEXT,
          original_path TEXT NOT NULL,
          imported_at INTEGER NOT NULL,
          UNIQUE(project_id, sha256)
        );
        CREATE INDEX IF NOT EXISTS source_documents_project_idx
          ON source_documents(project_id, imported_at DESC);
        CREATE TABLE IF NOT EXISTS source_chapters (
          id TEXT PRIMARY KEY,
          source_document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
          ordinal INTEGER NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          source_path TEXT,
          UNIQUE(source_document_id, ordinal)
        );
        CREATE TABLE IF NOT EXISTS source_segments (
          id TEXT PRIMARY KEY,
          source_document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
          chapter_id TEXT NOT NULL REFERENCES source_chapters(id) ON DELETE CASCADE,
          ordinal INTEGER NOT NULL,
          content TEXT NOT NULL,
          UNIQUE(chapter_id, ordinal)
        );
        CREATE TABLE IF NOT EXISTS source_issues (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
          code TEXT NOT NULL,
          severity TEXT NOT NULL,
          message TEXT NOT NULL,
          chapter_id TEXT
        );
        INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (2, unixepoch());

        CREATE TABLE IF NOT EXISTS story_bible_entries (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          value_json TEXT NOT NULL CHECK(json_valid(value_json)),
          revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(project_id, kind)
        );
        CREATE TABLE IF NOT EXISTS ai_candidates (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          value_json TEXT NOT NULL CHECK(json_valid(value_json)),
          source_snapshot_id TEXT,
          status TEXT NOT NULL CHECK(status IN ('draft', 'accepted', 'rejected')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS ai_candidates_project_idx
          ON ai_candidates(project_id, kind, created_at DESC);
        CREATE TABLE IF NOT EXISTS ai_tasks (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          model TEXT NOT NULL,
          state TEXT NOT NULL CHECK(state IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
          idempotency_key TEXT NOT NULL,
          input_json TEXT NOT NULL CHECK(json_valid(input_json)),
          output_json TEXT CHECK(output_json IS NULL OR json_valid(output_json)),
          error_json TEXT CHECK(error_json IS NULL OR json_valid(error_json)),
          input_tokens INTEGER,
          output_tokens INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(project_id, idempotency_key)
        );
        CREATE TABLE IF NOT EXISTS context_snapshots (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          scope_kind TEXT NOT NULL,
          scope_id TEXT NOT NULL,
          visible_through_ordinal INTEGER,
          payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
          created_at INTEGER NOT NULL
        );
        INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (3, unixepoch());

        CREATE VIRTUAL TABLE IF NOT EXISTS source_segments_fts USING fts5(
          content,
          content='source_segments',
          content_rowid='rowid',
          tokenize='unicode61'
        );
        CREATE TRIGGER IF NOT EXISTS source_segments_fts_insert AFTER INSERT ON source_segments BEGIN
          INSERT INTO source_segments_fts(rowid, content) VALUES (new.rowid, new.content);
        END;
        CREATE TRIGGER IF NOT EXISTS source_segments_fts_delete AFTER DELETE ON source_segments BEGIN
          INSERT INTO source_segments_fts(source_segments_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
        END;
        CREATE TRIGGER IF NOT EXISTS source_segments_fts_update AFTER UPDATE OF content ON source_segments BEGIN
          INSERT INTO source_segments_fts(source_segments_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
          INSERT INTO source_segments_fts(rowid, content) VALUES (new.rowid, new.content);
        END;
        INSERT OR REPLACE INTO source_segments_fts(rowid, content)
          SELECT rowid, content FROM source_segments;
        INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (4, unixepoch());

        CREATE TABLE IF NOT EXISTS source_analysis_items (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          source_document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
          chapter_id TEXT NOT NULL REFERENCES source_chapters(id) ON DELETE CASCADE,
          kind TEXT NOT NULL DEFAULT 'chapter_analysis',
          value_json TEXT NOT NULL CHECK(json_valid(value_json)),
          status TEXT NOT NULL CHECK(status IN ('draft', 'accepted', 'rejected')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(chapter_id, kind)
        );
        CREATE INDEX IF NOT EXISTS source_analysis_project_idx
          ON source_analysis_items(project_id, source_document_id, status);
        INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (5, unixepoch());

        CREATE TABLE IF NOT EXISTS rights_confirmations (
          source_document_id TEXT PRIMARY KEY REFERENCES source_documents(id) ON DELETE CASCADE,
          statement_version TEXT NOT NULL,
          confirmed_at INTEGER NOT NULL
        );
        INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (6, unixepoch());

        CREATE TABLE IF NOT EXISTS ai_task_runs (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          kind TEXT NOT NULL,
          provider_id TEXT NOT NULL,
          model TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('queued', 'running', 'paused', 'cancelling', 'cancelled', 'succeeded', 'failed')),
          idempotency_key TEXT NOT NULL,
          input_hash TEXT NOT NULL,
          input_json TEXT NOT NULL CHECK(json_valid(input_json)),
          output_json TEXT CHECK(output_json IS NULL OR json_valid(output_json)),
          error_json TEXT CHECK(error_json IS NULL OR json_valid(error_json)),
          input_tokens INTEGER CHECK(input_tokens IS NULL OR input_tokens >= 0),
          output_tokens INTEGER CHECK(output_tokens IS NULL OR output_tokens >= 0),
          cached_input_tokens INTEGER CHECK(cached_input_tokens IS NULL OR cached_input_tokens >= 0),
          revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(project_id, idempotency_key)
        );
        CREATE INDEX IF NOT EXISTS ai_task_runs_project_idx
          ON ai_task_runs(project_id, created_at DESC);
        INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (7, unixepoch());

        CREATE TABLE IF NOT EXISTS chapter_documents (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          chapter_plan_id TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('draft', 'final')),
          revision INTEGER NOT NULL CHECK(revision > 0),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE(project_id, chapter_plan_id)
        );
        CREATE TABLE IF NOT EXISTS chapter_versions (
          id TEXT PRIMARY KEY,
          chapter_document_id TEXT NOT NULL REFERENCES chapter_documents(id) ON DELETE CASCADE,
          revision INTEGER NOT NULL CHECK(revision > 0),
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          source TEXT NOT NULL CHECK(source IN ('manual', 'ai', 'restore', 'finalize')),
          created_at INTEGER NOT NULL,
          UNIQUE(chapter_document_id, revision)
        );
        CREATE INDEX IF NOT EXISTS chapter_documents_project_idx
          ON chapter_documents(project_id, updated_at DESC);
        INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (8, unixepoch());

        CREATE VIRTUAL TABLE IF NOT EXISTS chapter_documents_fts USING fts5(
          title,
          content,
          content='chapter_documents',
          content_rowid='rowid',
          tokenize='unicode61'
        );
        CREATE TRIGGER IF NOT EXISTS chapter_documents_fts_insert AFTER INSERT ON chapter_documents BEGIN
          INSERT INTO chapter_documents_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
        END;
        CREATE TRIGGER IF NOT EXISTS chapter_documents_fts_delete AFTER DELETE ON chapter_documents BEGIN
          INSERT INTO chapter_documents_fts(chapter_documents_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
        END;
        CREATE TRIGGER IF NOT EXISTS chapter_documents_fts_update AFTER UPDATE OF title, content ON chapter_documents BEGIN
          INSERT INTO chapter_documents_fts(chapter_documents_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
          INSERT INTO chapter_documents_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
        END;
        INSERT OR REPLACE INTO chapter_documents_fts(rowid, title, content)
          SELECT rowid, title, content FROM chapter_documents;
        INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (12, unixepoch());

        CREATE TABLE IF NOT EXISTS source_parse_revisions (
          id TEXT PRIMARY KEY,
          source_document_id TEXT NOT NULL REFERENCES source_documents(id) ON DELETE CASCADE,
          revision INTEGER NOT NULL CHECK(revision > 0),
          reason TEXT NOT NULL,
          snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),
          created_at INTEGER NOT NULL,
          UNIQUE(source_document_id, revision)
        );
        CREATE INDEX IF NOT EXISTS source_parse_revisions_source_idx
          ON source_parse_revisions(source_document_id, revision DESC);
        INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (13, unixepoch());

        CREATE TABLE IF NOT EXISTS consistency_reports (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          chapter_plan_id TEXT NOT NULL,
          chapter_document_revision INTEGER,
          report_json TEXT NOT NULL CHECK(json_valid(report_json)),
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS consistency_reports_chapter_idx
          ON consistency_reports(project_id, chapter_plan_id, created_at DESC);
        INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (9, unixepoch());

        CREATE TABLE IF NOT EXISTS project_checkpoints (
          id TEXT PRIMARY KEY,
          project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          name TEXT NOT NULL CHECK(length(trim(name)) > 0),
          package_path TEXT NOT NULL,
          byte_size INTEGER NOT NULL CHECK(byte_size > 0),
          created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS project_checkpoints_project_idx
          ON project_checkpoints(project_id, created_at DESC);
        INSERT OR IGNORE INTO schema_migrations(version, applied_at)
        VALUES (11, unixepoch());
        ",
        )?;
        let has_trashed_at = connection
            .prepare("SELECT 1 FROM pragma_table_info('projects') WHERE name = 'trashed_at'")?
            .exists([])?;
        if !has_trashed_at {
            connection.execute("ALTER TABLE projects ADD COLUMN trashed_at INTEGER", [])?;
        }
        let has_raw_text = connection
            .prepare("SELECT 1 FROM pragma_table_info('source_documents') WHERE name = 'raw_text'")?
            .exists([])?;
        if !has_raw_text {
            connection.execute(
                "ALTER TABLE source_documents ADD COLUMN raw_text TEXT NOT NULL DEFAULT ''",
                [],
            )?;
            connection.execute_batch(
                "UPDATE source_documents SET raw_text = COALESCE((
                   SELECT group_concat(title || char(10) || content, char(10) || char(10))
                   FROM (SELECT title, content FROM source_chapters WHERE source_document_id = source_documents.id ORDER BY ordinal)
                 ), '') WHERE raw_text = '';",
            )?;
        }
        connection.execute(
            "INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (10, unixepoch())",
            [],
        )?;
        Ok(())
    })();
    match result {
        Ok(()) => {
            connection.execute_batch("COMMIT")?;
            Ok(())
        }
        Err(error) => {
            let _ = connection.execute_batch("ROLLBACK");
            Err(error)
        }
    }
}

pub fn persist_worker_import(
    connection: &mut Connection,
    worker_payload: Value,
    original_path: &str,
    rights_confirmed: bool,
) -> Result<ImportedSourceRecord, DesktopError> {
    if !rights_confirmed {
        return Err(DesktopError::Validation(
            "导入前必须确认拥有合法使用或改编权".into(),
        ));
    }
    let result = worker_payload
        .get("result")
        .cloned()
        .ok_or_else(|| DesktopError::Validation("Worker 结果缺少 result 字段".into()))?;
    let parsed: WorkerImport = serde_json::from_value(result)?;
    if parsed.document.project_id.trim().is_empty() {
        return Err(DesktopError::Validation("项目 ID 不能为空".into()));
    }
    let document_id = format!(
        "src_{}_{}",
        parsed.document.project_id,
        &parsed.document.sha256[..parsed.document.sha256.len().min(24)]
    );
    let now = unix_timestamp()?;
    let raw_text = parsed.document.original_text.clone().unwrap_or_else(|| {
        parsed
            .chapters
            .iter()
            .map(|chapter| format!("{}\n{}", chapter.title, chapter.content))
            .collect::<Vec<_>>()
            .join("\n\n")
    });
    let transaction = connection.transaction()?;
    let project_exists: bool = transaction.query_row(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?1)",
        [&parsed.document.project_id],
        |row| row.get(0),
    )?;
    if !project_exists {
        return Err(DesktopError::Validation("导入目标项目不存在".into()));
    }

    transaction.execute(
        "INSERT INTO source_documents(id, project_id, file_name, format, byte_size, sha256, parser_version, encoding, original_path, imported_at, raw_text)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(project_id, sha256) DO UPDATE SET file_name=excluded.file_name, parser_version=excluded.parser_version, original_path=excluded.original_path, imported_at=excluded.imported_at, raw_text=excluded.raw_text",
        params![document_id, parsed.document.project_id, parsed.document.file_name, parsed.document.format, parsed.document.byte_size, parsed.document.sha256, parsed.document.parser_version, parsed.document.encoding, original_path, now, raw_text],
    )?;
    transaction.execute(
        "INSERT INTO rights_confirmations(source_document_id, statement_version, confirmed_at)
         VALUES (?1, 'rights-v1', ?2)
         ON CONFLICT(source_document_id) DO UPDATE SET statement_version=excluded.statement_version, confirmed_at=excluded.confirmed_at",
        params![document_id, now],
    )?;
    transaction.execute(
        "DELETE FROM source_issues WHERE source_document_id = ?1",
        [&document_id],
    )?;
    transaction.execute(
        "DELETE FROM source_segments WHERE source_document_id = ?1",
        [&document_id],
    )?;
    transaction.execute(
        "DELETE FROM source_chapters WHERE source_document_id = ?1",
        [&document_id],
    )?;
    let chapter_ids = parsed
        .chapters
        .iter()
        .map(|chapter| {
            (
                chapter.id.clone(),
                format!("{}_{}", document_id, chapter.id),
            )
        })
        .collect::<HashMap<_, _>>();
    for chapter in &parsed.chapters {
        let chapter_id = chapter_ids
            .get(&chapter.id)
            .ok_or_else(|| DesktopError::Validation("章节 ID 映射失败".into()))?;
        transaction.execute(
            "INSERT INTO source_chapters(id, source_document_id, ordinal, title, content, source_path) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![chapter_id, document_id, chapter.ordinal, chapter.title, chapter.content, chapter.source_path],
        )?;
    }
    for segment in &parsed.segments {
        let chapter_id = chapter_ids
            .get(&segment.chapter_id)
            .ok_or_else(|| DesktopError::Validation("文本片段引用了未知章节".into()))?;
        let segment_id = format!("{}_{}", document_id, segment.id);
        transaction.execute(
            "INSERT INTO source_segments(id, source_document_id, chapter_id, ordinal, content) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![segment_id, document_id, chapter_id, segment.ordinal, segment.content],
        )?;
    }
    for issue in &parsed.issues {
        let chapter_id = issue
            .chapter_id
            .as_ref()
            .and_then(|id| chapter_ids.get(id))
            .cloned();
        transaction.execute(
            "INSERT INTO source_issues(source_document_id, code, severity, message, chapter_id) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![document_id, issue.code, issue.severity, issue.message, chapter_id],
        )?;
    }
    transaction.commit()?;
    get_imported_source(connection, &document_id)
}

pub fn restore_source_snapshot(
    connection: &mut Connection,
    project_id: &str,
    source_snapshot: Value,
    restored_path: &str,
) -> Result<ImportedSourceRecord, DesktopError> {
    let backup: BackupImportedSource = serde_json::from_value(source_snapshot)?;
    if !matches!(
        backup.document.format.as_str(),
        "txt" | "markdown" | "epub" | "pdf"
    ) {
        return Err(DesktopError::Validation("项目包原文格式无效".into()));
    }
    if backup.chapters.is_empty() || backup.segments.is_empty() {
        return Err(DesktopError::Validation("项目包原文解析快照不完整".into()));
    }
    let document_prefix = format!("{}_", backup.document.id);
    let strip_document_prefix = |value: &str| {
        value
            .strip_prefix(&document_prefix)
            .unwrap_or(value)
            .to_owned()
    };
    let chapter_ids = backup
        .chapters
        .iter()
        .map(|chapter| (chapter.id.clone(), strip_document_prefix(&chapter.id)))
        .collect::<HashMap<_, _>>();
    let chapters = backup
        .chapters
        .iter()
        .map(|chapter| {
            serde_json::json!({
                "id": chapter_ids.get(&chapter.id).expect("chapter id map"),
                "ordinal": chapter.ordinal,
                "title": chapter.title,
                "content": chapter.content,
                "sourcePath": Value::Null,
            })
        })
        .collect::<Vec<_>>();
    let segments = backup
        .segments
        .iter()
        .map(|segment| {
            let chapter_id = chapter_ids
                .get(&segment.chapter_id)
                .ok_or_else(|| DesktopError::Validation("项目包文本片段引用了未知章节".into()))?;
            Ok(serde_json::json!({
                "id": strip_document_prefix(&segment.id),
                "chapterId": chapter_id,
                "ordinal": segment.ordinal,
                "content": segment.content,
            }))
        })
        .collect::<Result<Vec<_>, DesktopError>>()?;
    let issues = backup
        .issues
        .iter()
        .map(|issue| {
            serde_json::json!({
                "code": issue.code,
                "severity": issue.severity,
                "message": issue.message,
                "chapterId": issue.chapter_id.as_ref().and_then(|id| chapter_ids.get(id)),
            })
        })
        .collect::<Vec<_>>();
    let payload = serde_json::json!({
        "result": {
            "document": {
                "projectId": project_id,
                "fileName": backup.document.file_name,
                "format": backup.document.format,
                "byteSize": backup.document.byte_size.max(backup.document.original_text.len() as i64),
                "sha256": backup.document.sha256,
                "parserVersion": format!("backup-restore/{}", backup.document.parser_version),
                "encoding": backup.document.encoding,
                "originalText": backup.document.original_text,
            },
            "chapters": chapters,
            "segments": segments,
            "issues": issues,
        }
    });
    persist_worker_import(connection, payload, restored_path, true)
}

pub fn list_imported_sources(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<ImportedSourceRecord>, DesktopError> {
    let mut statement = connection.prepare(
        "SELECT id FROM source_documents WHERE project_id = ?1 ORDER BY imported_at DESC, id ASC",
    )?;
    let ids = statement
        .query_map([project_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    ids.iter()
        .map(|id| get_imported_source(connection, id))
        .collect()
}

pub fn revise_source_snapshot(
    connection: &mut Connection,
    source_snapshot: Value,
    reason: &str,
) -> Result<ImportedSourceRecord, DesktopError> {
    if reason.trim().is_empty() {
        return Err(DesktopError::Validation("解析校正必须记录原因".into()));
    }
    let revised: BackupImportedSource = serde_json::from_value(source_snapshot)?;
    if revised.document.id.trim().is_empty() || revised.chapters.is_empty() {
        return Err(DesktopError::Validation(
            "解析快照必须包含原文和至少一个章节".into(),
        ));
    }
    if revised.chapters.len() > 10_000 || revised.segments.len() > 2_000_000 {
        return Err(DesktopError::Validation("解析快照规模超过安全限制".into()));
    }
    let total_chars = revised
        .chapters
        .iter()
        .map(|chapter| chapter.content.chars().count())
        .sum::<usize>();
    if total_chars > 100_000_000 {
        return Err(DesktopError::Validation(
            "解析快照正文超过 1 亿字符限制".into(),
        ));
    }
    let previous = get_imported_source(connection, &revised.document.id)?;
    if previous.document.sha256 != revised.document.sha256 {
        return Err(DesktopError::Validation(
            "解析快照与只读原文件哈希不匹配".into(),
        ));
    }
    let mut chapter_ids = std::collections::HashSet::new();
    for (index, chapter) in revised.chapters.iter().enumerate() {
        if chapter.ordinal != index as i64
            || chapter.title.trim().is_empty()
            || !chapter_ids.insert(chapter.id.clone())
        {
            return Err(DesktopError::Validation("章节顺序、标题或 ID 无效".into()));
        }
    }
    let mut segment_ids = std::collections::HashSet::new();
    let mut chapter_segment_ordinals = HashMap::<String, i64>::new();
    for segment in &revised.segments {
        if !chapter_ids.contains(&segment.chapter_id)
            || segment.content.trim().is_empty()
            || !segment_ids.insert(segment.id.clone())
        {
            return Err(DesktopError::Validation("文本片段引用或 ID 无效".into()));
        }
        let expected = chapter_segment_ordinals
            .entry(segment.chapter_id.clone())
            .or_insert(0);
        if segment.ordinal != *expected {
            return Err(DesktopError::Validation("文本片段顺序不连续".into()));
        }
        *expected += 1;
    }
    let revision: i64 = connection.query_row(
        "SELECT COALESCE(MAX(revision), 0) + 1 FROM source_parse_revisions WHERE source_document_id = ?1",
        [&revised.document.id],
        |row| row.get(0),
    )?;
    let now = unix_timestamp()?;
    let previous_json = serde_json::to_string(&previous)?;
    let transaction = connection.transaction()?;
    transaction.execute(
        "INSERT INTO source_parse_revisions(id, source_document_id, revision, reason, snapshot_json, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![Uuid::new_v4().to_string(), revised.document.id, revision, reason.trim(), previous_json, now],
    )?;
    transaction.execute(
        "DELETE FROM source_issues WHERE source_document_id = ?1",
        [&revised.document.id],
    )?;
    transaction.execute(
        "DELETE FROM source_segments WHERE source_document_id = ?1",
        [&revised.document.id],
    )?;
    transaction.execute(
        "DELETE FROM source_chapters WHERE source_document_id = ?1",
        [&revised.document.id],
    )?;
    for chapter in &revised.chapters {
        transaction.execute(
            "INSERT INTO source_chapters(id, source_document_id, ordinal, title, content, source_path) VALUES (?1, ?2, ?3, ?4, ?5, NULL)",
            params![chapter.id, revised.document.id, chapter.ordinal, chapter.title.trim(), chapter.content],
        )?;
    }
    for segment in &revised.segments {
        transaction.execute(
            "INSERT INTO source_segments(id, source_document_id, chapter_id, ordinal, content) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![segment.id, revised.document.id, segment.chapter_id, segment.ordinal, segment.content],
        )?;
    }
    for issue in &revised.issues {
        if !matches!(issue.severity.as_str(), "info" | "warning" | "error") {
            return Err(DesktopError::Validation("导入质量问题级别无效".into()));
        }
        transaction.execute(
            "INSERT INTO source_issues(source_document_id, code, severity, message, chapter_id) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![revised.document.id, issue.code, issue.severity, issue.message, issue.chapter_id],
        )?;
    }
    transaction.execute(
        "UPDATE source_documents SET parser_version = ?2 WHERE id = ?1",
        params![revised.document.id, format!("manual-edit/{revision}")],
    )?;
    transaction.commit()?;
    get_imported_source(connection, &revised.document.id)
}

fn get_imported_source(
    connection: &Connection,
    document_id: &str,
) -> Result<ImportedSourceRecord, DesktopError> {
    let document = connection.query_row(
        "SELECT id, project_id, file_name, format, byte_size, sha256, parser_version, encoding, imported_at, raw_text FROM source_documents WHERE id = ?1",
        [document_id],
        |row| Ok(SourceDocumentRecord { id: row.get(0)?, project_id: row.get(1)?, file_name: row.get(2)?, format: row.get(3)?, byte_size: row.get(4)?, sha256: row.get(5)?, parser_version: row.get(6)?, encoding: row.get(7)?, imported_at: row.get(8)?, original_text: row.get(9)? }),
    )?;
    let mut chapter_statement = connection.prepare(
        "SELECT id, ordinal, title, content FROM source_chapters WHERE source_document_id = ?1 ORDER BY ordinal ASC",
    )?;
    let mut cursor = 0_i64;
    let chapters = chapter_statement
        .query_map([document_id], |row| {
            let content: String = row.get(3)?;
            let start = cursor;
            cursor += content.chars().count() as i64;
            Ok(SourceChapterRecord {
                id: row.get(0)?,
                source_document_id: document_id.to_owned(),
                ordinal: row.get(1)?,
                title: row.get(2)?,
                content,
                start_offset: start,
                end_offset: cursor,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut segment_statement = connection.prepare(
        "SELECT id, chapter_id, ordinal, content FROM source_segments WHERE source_document_id = ?1 ORDER BY chapter_id, ordinal ASC",
    )?;
    let segments = segment_statement
        .query_map([document_id], |row| {
            let content: String = row.get(3)?;
            Ok(SourceSegmentRecord {
                id: row.get(0)?,
                source_document_id: document_id.to_owned(),
                chapter_id: row.get(1)?,
                ordinal: row.get(2)?,
                start_offset: 0,
                end_offset: content.chars().count() as i64,
                content,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut issue_statement = connection.prepare(
        "SELECT code, severity, message, chapter_id FROM source_issues WHERE source_document_id = ?1 ORDER BY id ASC",
    )?;
    let issues = issue_statement
        .query_map([document_id], |row| {
            Ok(SourceIssueRecord {
                code: row.get(0)?,
                severity: row.get(1)?,
                message: row.get(2)?,
                chapter_id: row.get(3)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(ImportedSourceRecord {
        document,
        chapters,
        segments,
        issues,
    })
}

fn unix_timestamp() -> Result<i64, DesktopError> {
    Ok(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| DesktopError::Validation(format!("系统时间无效：{error}")))?
        .as_secs() as i64)
}

pub fn create_candidate(
    connection: &Connection,
    input: CreateCandidateInput,
) -> Result<CandidateRecord, DesktopError> {
    if input.project_id.trim().is_empty() || input.kind.trim().is_empty() {
        return Err(DesktopError::Validation("候选必须指定项目和类型".into()));
    }
    let id = Uuid::new_v4().to_string();
    let now = unix_timestamp()?;
    let value_json = serde_json::to_string(&input.value)?;
    connection.execute(
        "INSERT INTO ai_candidates(id, project_id, kind, value_json, source_snapshot_id, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'draft', ?6, ?6)",
        params![id, input.project_id, input.kind, value_json, input.source_snapshot_id, now],
    )?;
    Ok(CandidateRecord {
        id,
        project_id: input.project_id,
        kind: input.kind,
        value: input.value,
        source_snapshot_id: input.source_snapshot_id,
        status: "draft".into(),
        created_at: now,
        updated_at: now,
    })
}

pub fn list_candidates(
    connection: &Connection,
    project_id: &str,
    kind: Option<&str>,
) -> Result<Vec<CandidateRecord>, DesktopError> {
    if project_id.trim().is_empty() {
        return Err(DesktopError::Validation("候选查询必须指定项目".into()));
    }
    let mut statement = connection.prepare(
        "SELECT id, project_id, kind, value_json, source_snapshot_id, status, created_at, updated_at
         FROM ai_candidates WHERE project_id = ?1 AND (?2 IS NULL OR kind = ?2) ORDER BY created_at DESC",
    )?;
    let rows = statement
        .query_map(params![project_id, kind], |row| {
            let value_json: String = row.get(3)?;
            Ok(CandidateRecord {
                id: row.get(0)?,
                project_id: row.get(1)?,
                kind: row.get(2)?,
                value: serde_json::from_str(&value_json).map_err(|error| rusqlite::Error::FromSqlConversionFailure(3, rusqlite::types::Type::Text, Box::new(error)))?,
                source_snapshot_id: row.get(4)?,
                status: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn reject_candidate(connection: &Connection, candidate_id: &str) -> Result<(), DesktopError> {
    let changed = connection.execute(
        "UPDATE ai_candidates SET status = 'rejected', updated_at = unixepoch() WHERE id = ?1 AND status = 'draft'",
        [candidate_id],
    )?;
    if changed == 0 {
        return Err(DesktopError::Validation("候选不存在或已经处理".into()));
    }
    Ok(())
}

pub fn accept_candidate(
    connection: &mut Connection,
    candidate_id: &str,
) -> Result<StoryBibleRecord, DesktopError> {
    let transaction = connection.transaction()?;
    let (project_id, kind, value_json): (String, String, String) = transaction
        .query_row(
            "SELECT project_id, kind, value_json FROM ai_candidates WHERE id = ?1 AND status = 'draft'",
            [candidate_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => DesktopError::Validation("候选不存在或已经处理".into()),
            other => DesktopError::Database(other),
        })?;
    let now = unix_timestamp()?;
    let entry_id = format!("bible_{project_id}_{kind}");
    transaction.execute(
        "INSERT INTO story_bible_entries(id, project_id, kind, value_json, revision, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)
         ON CONFLICT(project_id, kind) DO UPDATE SET value_json=excluded.value_json, revision=story_bible_entries.revision + 1, updated_at=excluded.updated_at",
        params![entry_id, project_id, kind, value_json, now],
    )?;
    transaction.execute(
        "UPDATE ai_candidates SET status = 'accepted', updated_at = ?2 WHERE id = ?1",
        params![candidate_id, now],
    )?;
    let record = transaction.query_row(
        "SELECT id, project_id, kind, value_json, revision, updated_at FROM story_bible_entries WHERE project_id = ?1 AND kind = ?2",
        params![project_id, kind],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, String>(2)?, row.get::<_, String>(3)?, row.get::<_, i64>(4)?, row.get::<_, i64>(5)?)),
    )?;
    transaction.commit()?;
    Ok(StoryBibleRecord {
        id: record.0,
        project_id: record.1,
        kind: record.2,
        value: serde_json::from_str(&record.3)?,
        revision: record.4,
        updated_at: record.5,
    })
}

pub fn list_story_bible(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<StoryBibleRecord>, DesktopError> {
    let mut statement = connection.prepare(
        "SELECT id, project_id, kind, value_json, revision, updated_at
         FROM story_bible_entries WHERE project_id = ?1 ORDER BY kind ASC",
    )?;
    let rows = statement.query_map([project_id], |row| {
        Ok((
            row.get::<_, String>(0)?,
            row.get::<_, String>(1)?,
            row.get::<_, String>(2)?,
            row.get::<_, String>(3)?,
            row.get::<_, i64>(4)?,
            row.get::<_, i64>(5)?,
        ))
    })?;
    rows.map(|row| {
        let row = row?;
        Ok(StoryBibleRecord {
            id: row.0,
            project_id: row.1,
            kind: row.2,
            value: serde_json::from_str(&row.3)?,
            revision: row.4,
            updated_at: row.5,
        })
    })
    .collect()
}

pub fn save_story_bible(
    connection: &Connection,
    input: SaveStoryBibleInput,
) -> Result<StoryBibleRecord, DesktopError> {
    if input.project_id.trim().is_empty() || input.kind.trim().is_empty() {
        return Err(DesktopError::Validation(
            "故事圣经必须指定项目和类型".into(),
        ));
    }
    let id = format!("bible_{}_{}", input.project_id, input.kind);
    let now = unix_timestamp()?;
    let value_json = serde_json::to_string(&input.value)?;
    connection.execute(
        "INSERT INTO story_bible_entries(id, project_id, kind, value_json, revision, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)
         ON CONFLICT(project_id, kind) DO UPDATE SET value_json=excluded.value_json, revision=story_bible_entries.revision + 1, updated_at=excluded.updated_at",
        params![id, input.project_id, input.kind, value_json, now],
    )?;
    connection.query_row(
        "SELECT id, project_id, kind, value_json, revision, updated_at FROM story_bible_entries WHERE project_id = ?1 AND kind = ?2",
        params![input.project_id, input.kind],
        |row| {
            let raw: String = row.get(3)?;
            let value = serde_json::from_str(&raw).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(3, rusqlite::types::Type::Text, Box::new(error))
            })?;
            Ok(StoryBibleRecord { id: row.get(0)?, project_id: row.get(1)?, kind: row.get(2)?, value, revision: row.get(4)?, updated_at: row.get(5)? })
        },
    ).map_err(DesktopError::from)
}

pub fn search_source_segments(
    connection: &Connection,
    project_id: &str,
    query: &str,
    limit: i64,
) -> Result<Vec<SearchHitRecord>, DesktopError> {
    if project_id.trim().is_empty() || query.trim().is_empty() {
        return Err(DesktopError::Validation("检索必须指定项目和关键词".into()));
    }
    let safe_limit = limit.clamp(1, 100);
    let mut statement = connection.prepare(
        "SELECT segment.id, segment.source_document_id, segment.chapter_id, segment.content, bm25(source_segments_fts)
         FROM source_segments_fts
         JOIN source_segments AS segment ON segment.rowid = source_segments_fts.rowid
         JOIN source_documents AS document ON document.id = segment.source_document_id
         WHERE source_segments_fts MATCH ?1 AND document.project_id = ?2
         ORDER BY bm25(source_segments_fts) ASC LIMIT ?3",
    )?;
    let rows = statement.query_map(params![query.trim(), project_id, safe_limit], |row| {
        Ok(SearchHitRecord {
            segment_id: row.get(0)?,
            source_document_id: row.get(1)?,
            chapter_id: row.get(2)?,
            content: row.get(3)?,
            rank: row.get(4)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(DesktopError::from)
}

pub fn save_source_analysis(
    connection: &Connection,
    input: SaveSourceAnalysisInput,
) -> Result<SourceAnalysisRecord, DesktopError> {
    let owns_chapter: bool = connection.query_row(
        "SELECT EXISTS(
           SELECT 1 FROM source_chapters chapter
           JOIN source_documents document ON document.id = chapter.source_document_id
           WHERE chapter.id = ?1 AND document.id = ?2 AND document.project_id = ?3
         )",
        params![input.chapter_id, input.source_document_id, input.project_id],
        |row| row.get(0),
    )?;
    if !owns_chapter {
        return Err(DesktopError::Validation(
            "分析结果引用了其他项目或文档的章节".into(),
        ));
    }
    let id = format!("analysis_{}", input.chapter_id);
    let value_json = serde_json::to_string(&input.value)?;
    let now = unix_timestamp()?;
    connection.execute(
        "INSERT INTO source_analysis_items(id, project_id, source_document_id, chapter_id, kind, value_json, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'chapter_analysis', ?5, 'draft', ?6, ?6)
         ON CONFLICT(chapter_id, kind) DO UPDATE SET value_json=excluded.value_json, status='draft', updated_at=excluded.updated_at",
        params![id, input.project_id, input.source_document_id, input.chapter_id, value_json, now],
    )?;
    get_source_analysis(connection, &id)
}

pub fn list_source_analysis(
    connection: &Connection,
    source_document_id: &str,
) -> Result<Vec<SourceAnalysisRecord>, DesktopError> {
    let mut statement = connection.prepare(
        "SELECT id FROM source_analysis_items WHERE source_document_id = ?1 ORDER BY created_at ASC, id ASC",
    )?;
    let ids = statement
        .query_map([source_document_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    ids.iter()
        .map(|id| get_source_analysis(connection, id))
        .collect()
}

pub fn set_source_analysis_status(
    connection: &Connection,
    analysis_id: &str,
    status: &str,
) -> Result<SourceAnalysisRecord, DesktopError> {
    if !matches!(status, "draft" | "accepted" | "rejected") {
        return Err(DesktopError::Validation("分析审核状态无效".into()));
    }
    let changed = connection.execute(
        "UPDATE source_analysis_items SET status = ?2, updated_at = unixepoch() WHERE id = ?1",
        params![analysis_id, status],
    )?;
    if changed == 0 {
        return Err(DesktopError::Validation("分析结果不存在".into()));
    }
    get_source_analysis(connection, analysis_id)
}

fn get_source_analysis(
    connection: &Connection,
    analysis_id: &str,
) -> Result<SourceAnalysisRecord, DesktopError> {
    connection.query_row(
        "SELECT id, project_id, source_document_id, chapter_id, value_json, status, created_at, updated_at FROM source_analysis_items WHERE id = ?1",
        [analysis_id],
        |row| {
            let raw: String = row.get(4)?;
            let value = serde_json::from_str(&raw).map_err(|error| rusqlite::Error::FromSqlConversionFailure(4, rusqlite::types::Type::Text, Box::new(error)))?;
            Ok(SourceAnalysisRecord { id: row.get(0)?, project_id: row.get(1)?, source_document_id: row.get(2)?, chapter_id: row.get(3)?, value, status: row.get(5)?, created_at: row.get(6)?, updated_at: row.get(7)? })
        },
    ).map_err(|error| match error {
        rusqlite::Error::QueryReturnedNoRows => DesktopError::Validation("分析结果不存在".into()),
        other => DesktopError::Database(other),
    })
}

pub fn create_ai_task(
    connection: &Connection,
    input: CreateAiTaskInput,
) -> Result<AiTaskRecord, DesktopError> {
    for (label, value) in [
        ("任务 ID", input.id.as_str()),
        ("项目 ID", input.project_id.as_str()),
        ("任务类型", input.kind.as_str()),
        ("模型服务", input.provider_id.as_str()),
        ("模型", input.model.as_str()),
        ("幂等键", input.idempotency_key.as_str()),
        ("输入摘要", input.input_hash.as_str()),
    ] {
        if value.trim().is_empty() {
            return Err(DesktopError::Validation(format!("{label}不能为空")));
        }
    }
    let now = unix_timestamp()?;
    let input_json = serde_json::to_string(&input.input)?;
    connection.execute(
        "INSERT INTO ai_task_runs(id, project_id, kind, provider_id, model, status, idempotency_key, input_hash, input_json, revision, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'queued', ?6, ?7, ?8, 0, ?9, ?9)
         ON CONFLICT(project_id, idempotency_key) DO NOTHING",
        params![input.id, input.project_id, input.kind, input.provider_id, input.model, input.idempotency_key, input.input_hash, input_json, now],
    )?;
    let id = connection.query_row(
        "SELECT id FROM ai_task_runs WHERE project_id = ?1 AND idempotency_key = ?2",
        params![input.project_id, input.idempotency_key],
        |row| row.get::<_, String>(0),
    )?;
    get_ai_task(connection, &id)
}

pub fn update_ai_task(
    connection: &Connection,
    input: UpdateAiTaskInput,
) -> Result<AiTaskRecord, DesktopError> {
    let current = get_ai_task(connection, &input.task_id)?;
    let allowed = matches!(
        (current.status.as_str(), input.status.as_str()),
        ("queued", "running" | "paused" | "cancelled")
            | ("running", "paused" | "cancelling" | "succeeded" | "failed")
            | ("paused", "queued" | "cancelled")
            | ("cancelling", "cancelled" | "failed")
            | ("failed", "queued")
    );
    if !allowed {
        return Err(DesktopError::Validation(format!(
            "非法 AI 任务状态转换：{} → {}",
            current.status, input.status
        )));
    }
    if input.status == "failed" && input.error.is_none() {
        return Err(DesktopError::Validation("失败任务必须记录错误".into()));
    }
    if input.status != "failed" && input.error.is_some() {
        return Err(DesktopError::Validation("只有失败任务可以记录错误".into()));
    }
    if [
        input.input_tokens,
        input.output_tokens,
        input.cached_input_tokens,
    ]
    .into_iter()
    .flatten()
    .any(|value| value < 0)
    {
        return Err(DesktopError::Validation("Token 用量不能为负数".into()));
    }
    let output_json = input
        .output
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;
    let error_json = input
        .error
        .as_ref()
        .map(serde_json::to_string)
        .transpose()?;
    let changed = connection.execute(
        "UPDATE ai_task_runs SET status = ?3, output_json = COALESCE(?4, output_json), error_json = ?5,
           input_tokens = COALESCE(?6, input_tokens), output_tokens = COALESCE(?7, output_tokens),
           cached_input_tokens = COALESCE(?8, cached_input_tokens), revision = revision + 1, updated_at = unixepoch()
         WHERE id = ?1 AND revision = ?2",
        params![input.task_id, input.expected_revision, input.status, output_json, error_json, input.input_tokens, input.output_tokens, input.cached_input_tokens],
    )?;
    if changed == 0 {
        return Err(DesktopError::Validation(
            "任务已被其他流程更新，请重新读取".into(),
        ));
    }
    get_ai_task(connection, &input.task_id)
}

pub fn list_ai_tasks(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<AiTaskRecord>, DesktopError> {
    let mut statement = connection.prepare(
        "SELECT id FROM ai_task_runs WHERE project_id = ?1 ORDER BY created_at DESC, id DESC",
    )?;
    let ids = statement
        .query_map([project_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    ids.iter().map(|id| get_ai_task(connection, id)).collect()
}

fn get_ai_task(connection: &Connection, task_id: &str) -> Result<AiTaskRecord, DesktopError> {
    connection
        .query_row(
            "SELECT id, project_id, kind, provider_id, model, status, idempotency_key, input_hash, input_json,
                    output_json, error_json, input_tokens, output_tokens, cached_input_tokens, revision, created_at, updated_at
             FROM ai_task_runs WHERE id = ?1",
            [task_id],
            |row| {
                let input_raw: String = row.get(8)?;
                let output_raw: Option<String> = row.get(9)?;
                let error_raw: Option<String> = row.get(10)?;
                let decode = |index, raw: String| serde_json::from_str(&raw).map_err(|error| rusqlite::Error::FromSqlConversionFailure(index, rusqlite::types::Type::Text, Box::new(error)));
                Ok(AiTaskRecord {
                    id: row.get(0)?, project_id: row.get(1)?, kind: row.get(2)?, provider_id: row.get(3)?, model: row.get(4)?, status: row.get(5)?, idempotency_key: row.get(6)?, input_hash: row.get(7)?,
                    input: decode(8, input_raw)?, output: output_raw.map(|raw| decode(9, raw)).transpose()?, error: error_raw.map(|raw| decode(10, raw)).transpose()?,
                    input_tokens: row.get(11)?, output_tokens: row.get(12)?, cached_input_tokens: row.get(13)?, revision: row.get(14)?, created_at: row.get(15)?, updated_at: row.get(16)?,
                })
            },
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => DesktopError::Validation("AI 任务不存在".into()),
            other => DesktopError::Database(other),
        })
}

pub fn save_chapter_draft(
    connection: &mut Connection,
    input: SaveChapterDraftInput,
) -> Result<ChapterDraftRecord, DesktopError> {
    if input.project_id.trim().is_empty() || input.chapter_plan_id.trim().is_empty() {
        return Err(DesktopError::Validation(
            "章节草稿必须指定项目和章节规划".into(),
        ));
    }
    if input.title.trim().is_empty() {
        return Err(DesktopError::Validation("章节标题不能为空".into()));
    }
    if !matches!(
        input.source.as_str(),
        "manual" | "ai" | "restore" | "finalize"
    ) {
        return Err(DesktopError::Validation("章节版本来源无效".into()));
    }
    let existing: Option<(String, i64, String, String)> = connection
        .query_row(
            "SELECT id, revision, title, content FROM chapter_documents WHERE project_id = ?1 AND chapter_plan_id = ?2",
            params![input.project_id, input.chapter_plan_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()?;
    if let Some((id, revision, title, content)) = &existing {
        if input
            .expected_revision
            .is_some_and(|expected| expected != *revision)
        {
            return Err(DesktopError::Validation(format!(
                "章节版本冲突：期望 {}，实际 {}",
                input.expected_revision.unwrap_or_default(),
                revision
            )));
        }
        if title == input.title.trim() && content == &input.content {
            return get_chapter_draft(connection, id);
        }
    } else if input
        .expected_revision
        .is_some_and(|revision| revision != 0)
    {
        return Err(DesktopError::Validation(
            "新章节的期望修订号必须为 0".into(),
        ));
    }

    let now = unix_timestamp()?;
    let transaction = connection.transaction()?;
    let (id, revision) = if let Some((id, current_revision, _, _)) = existing {
        let revision = current_revision + 1;
        let changed = transaction.execute(
            "UPDATE chapter_documents SET title = ?2, content = ?3, revision = ?4, updated_at = ?5 WHERE id = ?1 AND revision = ?6",
            params![id, input.title.trim(), input.content, revision, now, current_revision],
        )?;
        if changed == 0 {
            return Err(DesktopError::Validation(
                "章节已被其他流程更新，请重新读取".into(),
            ));
        }
        (id, revision)
    } else {
        let id = format!("chapter_document_{}", Uuid::new_v4());
        transaction.execute(
            "INSERT INTO chapter_documents(id, project_id, chapter_plan_id, title, content, status, revision, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 'draft', 1, ?6, ?6)",
            params![id, input.project_id, input.chapter_plan_id, input.title.trim(), input.content, now],
        )?;
        (id, 1)
    };
    transaction.execute(
        "INSERT INTO chapter_versions(id, chapter_document_id, revision, title, content, source, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![format!("chapter_version_{}", Uuid::new_v4()), id, revision, input.title.trim(), input.content, input.source, now],
    )?;
    transaction.commit()?;
    get_chapter_draft(connection, &id)
}

pub fn list_chapter_drafts(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<ChapterDraftRecord>, DesktopError> {
    let mut statement = connection.prepare(
        "SELECT id FROM chapter_documents WHERE project_id = ?1 ORDER BY updated_at DESC, chapter_plan_id ASC",
    )?;
    let ids = statement
        .query_map([project_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    ids.iter()
        .map(|id| get_chapter_draft(connection, id))
        .collect()
}

pub fn list_chapter_versions(
    connection: &Connection,
    chapter_document_id: &str,
) -> Result<Vec<ChapterVersionRecord>, DesktopError> {
    let mut statement = connection.prepare(
        "SELECT id, chapter_document_id, revision, title, content, source, created_at
         FROM chapter_versions WHERE chapter_document_id = ?1 ORDER BY revision DESC",
    )?;
    let rows = statement.query_map([chapter_document_id], |row| {
        Ok(ChapterVersionRecord {
            id: row.get(0)?,
            chapter_document_id: row.get(1)?,
            revision: row.get(2)?,
            title: row.get(3)?,
            content: row.get(4)?,
            source: row.get(5)?,
            created_at: row.get(6)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(DesktopError::from)
}

pub fn set_chapter_status(
    connection: &Connection,
    chapter_document_id: &str,
    status: &str,
) -> Result<ChapterDraftRecord, DesktopError> {
    if !matches!(status, "draft" | "final") {
        return Err(DesktopError::Validation("章节状态无效".into()));
    }
    let changed = connection.execute(
        "UPDATE chapter_documents SET status = ?2, updated_at = unixepoch() WHERE id = ?1",
        params![chapter_document_id, status],
    )?;
    if changed == 0 {
        return Err(DesktopError::Validation("章节草稿不存在".into()));
    }
    get_chapter_draft(connection, chapter_document_id)
}

fn get_chapter_draft(
    connection: &Connection,
    chapter_document_id: &str,
) -> Result<ChapterDraftRecord, DesktopError> {
    connection
        .query_row(
            "SELECT id, project_id, chapter_plan_id, title, content, status, revision, created_at, updated_at
             FROM chapter_documents WHERE id = ?1",
            [chapter_document_id],
            |row| {
                Ok(ChapterDraftRecord {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    chapter_plan_id: row.get(2)?,
                    title: row.get(3)?,
                    content: row.get(4)?,
                    status: row.get(5)?,
                    revision: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            },
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => DesktopError::Validation("章节草稿不存在".into()),
            other => DesktopError::Database(other),
        })
}

pub fn create_context_snapshot(
    connection: &Connection,
    input: CreateContextSnapshotInput,
) -> Result<ContextSnapshotRecord, DesktopError> {
    if input.id.trim().is_empty()
        || input.project_id.trim().is_empty()
        || input.scope_kind.trim().is_empty()
        || input.scope_id.trim().is_empty()
    {
        return Err(DesktopError::Validation(
            "上下文快照必须指定 ID、项目和作用域".into(),
        ));
    }
    if input.visible_through_ordinal.is_some_and(|value| value < 0) {
        return Err(DesktopError::Validation(
            "上下文可见章节序号不能为负数".into(),
        ));
    }
    let payload_json = serde_json::to_string(&input.payload)?;
    let now = unix_timestamp()?;
    connection.execute(
        "INSERT INTO context_snapshots(id, project_id, scope_kind, scope_id, visible_through_ordinal, payload_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO NOTHING",
        params![input.id, input.project_id, input.scope_kind, input.scope_id, input.visible_through_ordinal, payload_json, now],
    )?;
    get_context_snapshot(connection, &input.id)
}

pub fn list_context_snapshots(
    connection: &Connection,
    project_id: &str,
    scope_id: Option<&str>,
) -> Result<Vec<ContextSnapshotRecord>, DesktopError> {
    let mut statement = connection.prepare(
        "SELECT id FROM context_snapshots
         WHERE project_id = ?1 AND (?2 IS NULL OR scope_id = ?2)
         ORDER BY created_at DESC, id DESC",
    )?;
    let ids = statement
        .query_map(params![project_id, scope_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    ids.iter()
        .map(|id| get_context_snapshot(connection, id))
        .collect()
}

fn get_context_snapshot(
    connection: &Connection,
    snapshot_id: &str,
) -> Result<ContextSnapshotRecord, DesktopError> {
    connection
        .query_row(
            "SELECT id, project_id, scope_kind, scope_id, visible_through_ordinal, payload_json, created_at
             FROM context_snapshots WHERE id = ?1",
            [snapshot_id],
            |row| {
                let raw: String = row.get(5)?;
                let payload = serde_json::from_str(&raw).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        5,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;
                Ok(ContextSnapshotRecord {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    scope_kind: row.get(2)?,
                    scope_id: row.get(3)?,
                    visible_through_ordinal: row.get(4)?,
                    payload,
                    created_at: row.get(6)?,
                })
            },
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                DesktopError::Validation("上下文快照不存在".into())
            }
            other => DesktopError::Database(other),
        })
}

pub fn save_consistency_report(
    connection: &Connection,
    input: SaveConsistencyReportInput,
) -> Result<ConsistencyReportRecord, DesktopError> {
    if input.project_id.trim().is_empty() || input.chapter_plan_id.trim().is_empty() {
        return Err(DesktopError::Validation(
            "一致性报告必须指定项目和章节".into(),
        ));
    }
    if input
        .chapter_document_revision
        .is_some_and(|revision| revision <= 0)
    {
        return Err(DesktopError::Validation("章节修订号必须大于零".into()));
    }
    let id = format!("consistency_report_{}", Uuid::new_v4());
    let report_json = serde_json::to_string(&input.report)?;
    let now = unix_timestamp()?;
    connection.execute(
        "INSERT INTO consistency_reports(id, project_id, chapter_plan_id, chapter_document_revision, report_json, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![id, input.project_id, input.chapter_plan_id, input.chapter_document_revision, report_json, now],
    )?;
    get_consistency_report(connection, &id)
}

pub fn list_consistency_reports(
    connection: &Connection,
    project_id: &str,
    chapter_plan_id: &str,
) -> Result<Vec<ConsistencyReportRecord>, DesktopError> {
    let mut statement = connection.prepare(
        "SELECT id FROM consistency_reports WHERE project_id = ?1 AND chapter_plan_id = ?2 ORDER BY created_at DESC, id DESC",
    )?;
    let ids = statement
        .query_map(params![project_id, chapter_plan_id], |row| {
            row.get::<_, String>(0)
        })?
        .collect::<Result<Vec<_>, _>>()?;
    ids.iter()
        .map(|id| get_consistency_report(connection, id))
        .collect()
}

fn get_consistency_report(
    connection: &Connection,
    report_id: &str,
) -> Result<ConsistencyReportRecord, DesktopError> {
    connection
        .query_row(
            "SELECT id, project_id, chapter_plan_id, chapter_document_revision, report_json, created_at
             FROM consistency_reports WHERE id = ?1",
            [report_id],
            |row| {
                let raw: String = row.get(4)?;
                let report = serde_json::from_str(&raw).map_err(|error| {
                    rusqlite::Error::FromSqlConversionFailure(
                        4,
                        rusqlite::types::Type::Text,
                        Box::new(error),
                    )
                })?;
                Ok(ConsistencyReportRecord {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    chapter_plan_id: row.get(2)?,
                    chapter_document_revision: row.get(3)?,
                    report,
                    created_at: row.get(5)?,
                })
            },
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                DesktopError::Validation("一致性报告不存在".into())
            }
            other => DesktopError::Database(other),
        })
}

pub fn create_project(
    connection: &Connection,
    input: CreateProjectInput,
) -> Result<ProjectRecord, DesktopError> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(DesktopError::Validation("作品名称不能为空".into()));
    }
    if matches!(input.target_word_count, Some(value) if value <= 0) {
        return Err(DesktopError::Validation("目标字数必须大于零".into()));
    }
    let id = Uuid::new_v4().to_string();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|error| DesktopError::Validation(format!("系统时间无效：{error}")))?
        .as_secs() as i64;
    let record = ProjectRecord {
        id,
        title: title.to_owned(),
        genre: input.genre.trim().to_owned(),
        language: input.language.trim().to_owned(),
        target_word_count: input.target_word_count,
        status: "preparing".into(),
        created_at: now,
        updated_at: now,
        trashed_at: None,
    };
    connection.execute(
        "INSERT INTO projects(id, title, genre, language, target_word_count, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![record.id, record.title, record.genre, record.language, record.target_word_count, record.status, record.created_at, record.updated_at],
    )?;
    Ok(record)
}

pub fn list_projects(connection: &Connection) -> Result<Vec<ProjectRecord>, DesktopError> {
    let mut statement = connection.prepare(
        "SELECT id, title, genre, language, target_word_count, status, created_at, updated_at, trashed_at
         FROM projects WHERE trashed_at IS NULL ORDER BY updated_at DESC, id ASC",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(ProjectRecord {
            id: row.get(0)?,
            title: row.get(1)?,
            genre: row.get(2)?,
            language: row.get(3)?,
            target_word_count: row.get(4)?,
            status: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
            trashed_at: row.get(8)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(DesktopError::from)
}

pub fn list_trashed_projects(connection: &Connection) -> Result<Vec<ProjectRecord>, DesktopError> {
    let mut statement = connection.prepare(
        "SELECT id, title, genre, language, target_word_count, status, created_at, updated_at, trashed_at
         FROM projects WHERE trashed_at IS NOT NULL ORDER BY trashed_at DESC, id ASC",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(ProjectRecord {
            id: row.get(0)?,
            title: row.get(1)?,
            genre: row.get(2)?,
            language: row.get(3)?,
            target_word_count: row.get(4)?,
            status: row.get(5)?,
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
            trashed_at: row.get(8)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(DesktopError::from)
}

pub fn trash_project(
    connection: &Connection,
    project_id: &str,
) -> Result<ProjectRecord, DesktopError> {
    let changed = connection.execute(
        "UPDATE projects SET trashed_at = unixepoch(), updated_at = unixepoch()
         WHERE id = ?1 AND trashed_at IS NULL",
        [project_id],
    )?;
    if changed == 0 {
        return Err(DesktopError::Validation("项目不存在或已在回收站".into()));
    }
    get_project(connection, project_id)
}

pub fn restore_trashed_project(
    connection: &Connection,
    project_id: &str,
) -> Result<ProjectRecord, DesktopError> {
    let changed = connection.execute(
        "UPDATE projects SET trashed_at = NULL, updated_at = unixepoch()
         WHERE id = ?1 AND trashed_at IS NOT NULL",
        [project_id],
    )?;
    if changed == 0 {
        return Err(DesktopError::Validation("回收站项目不存在".into()));
    }
    get_project(connection, project_id)
}

pub fn rename_project(
    connection: &Connection,
    input: RenameProjectInput,
) -> Result<ProjectRecord, DesktopError> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err(DesktopError::Validation("作品名称不能为空".into()));
    }
    let changed = connection.execute(
        "UPDATE projects SET title = ?2, updated_at = unixepoch() WHERE id = ?1",
        params![input.project_id, title],
    )?;
    if changed == 0 {
        return Err(DesktopError::Validation("项目不存在".into()));
    }
    get_project(connection, &input.project_id)
}

pub fn set_project_status(
    connection: &Connection,
    project_id: &str,
    status: &str,
) -> Result<ProjectRecord, DesktopError> {
    if !matches!(status, "preparing" | "rewriting" | "completed" | "archived") {
        return Err(DesktopError::Validation("项目状态无效".into()));
    }
    let changed = connection.execute(
        "UPDATE projects SET status = ?2, updated_at = unixepoch() WHERE id = ?1",
        params![project_id, status],
    )?;
    if changed == 0 {
        return Err(DesktopError::Validation("项目不存在".into()));
    }
    get_project(connection, project_id)
}

pub fn duplicate_project(
    connection: &mut Connection,
    project_id: &str,
    title: Option<&str>,
) -> Result<ProjectRecord, DesktopError> {
    let source = get_project(connection, project_id)?;
    let target_id = Uuid::new_v4().to_string();
    let target_title = title
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .unwrap_or_else(|| format!("{} 副本", source.title));
    let now = unix_timestamp()?;
    let transaction = connection.transaction()?;
    transaction.execute(
        "INSERT INTO projects(id, title, genre, language, target_word_count, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, 'preparing', ?6, ?6)",
        params![target_id, target_title, source.genre, source.language, source.target_word_count, now],
    )?;
    transaction.execute(
        "INSERT INTO story_bible_entries(id, project_id, kind, value_json, revision, created_at, updated_at)
         SELECT 'bible_' || ?2 || '_' || kind, ?2, kind, value_json, revision, ?3, ?3
         FROM story_bible_entries WHERE project_id = ?1",
        params![project_id, target_id, now],
    )?;
    let source_documents = {
        let mut statement = transaction.prepare(
            "SELECT id, file_name, format, byte_size, sha256, parser_version, encoding, original_path, imported_at, raw_text
             FROM source_documents WHERE project_id = ?1 ORDER BY imported_at ASC",
        )?;
        statement
            .query_map([project_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, i64>(8)?,
                    row.get::<_, String>(9)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?
    };
    for document in source_documents {
        let new_document_id = format!(
            "src_{}_{}",
            target_id,
            &document.4[..document.4.len().min(24)]
        );
        transaction.execute(
            "INSERT INTO source_documents(id, project_id, file_name, format, byte_size, sha256, parser_version, encoding, original_path, imported_at, raw_text)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![new_document_id, target_id, document.1, document.2, document.3, document.4, document.5, document.6, document.7, document.8, document.9],
        )?;
        transaction.execute(
            "INSERT INTO source_chapters(id, source_document_id, ordinal, title, content, source_path)
             SELECT replace(id, ?1, ?2), ?2, ordinal, title, content, source_path FROM source_chapters WHERE source_document_id = ?1",
            params![document.0, new_document_id],
        )?;
        transaction.execute(
            "INSERT INTO source_segments(id, source_document_id, chapter_id, ordinal, content)
             SELECT replace(id, ?1, ?2), ?2, replace(chapter_id, ?1, ?2), ordinal, content FROM source_segments WHERE source_document_id = ?1",
            params![document.0, new_document_id],
        )?;
        transaction.execute(
            "INSERT INTO source_issues(source_document_id, code, severity, message, chapter_id)
             SELECT ?2, code, severity, message, CASE WHEN chapter_id IS NULL THEN NULL ELSE replace(chapter_id, ?1, ?2) END FROM source_issues WHERE source_document_id = ?1",
            params![document.0, new_document_id],
        )?;
        transaction.execute(
            "INSERT INTO rights_confirmations(source_document_id, statement_version, confirmed_at)
             SELECT ?2, statement_version, confirmed_at FROM rights_confirmations WHERE source_document_id = ?1",
            params![document.0, new_document_id],
        )?;
        transaction.execute(
            "INSERT INTO source_analysis_items(id, project_id, source_document_id, chapter_id, kind, value_json, status, created_at, updated_at)
             SELECT 'analysis_' || lower(hex(randomblob(16))), ?3, ?2, replace(chapter_id, ?1, ?2), kind, value_json, status, created_at, updated_at
             FROM source_analysis_items WHERE source_document_id = ?1",
            params![document.0, new_document_id, target_id],
        )?;
    }
    transaction.execute(
        "INSERT INTO ai_candidates(id, project_id, kind, value_json, source_snapshot_id, status, created_at, updated_at)
         SELECT 'candidate_' || lower(hex(randomblob(16))), ?2, kind, value_json,
                CASE WHEN source_snapshot_id IS NULL THEN NULL ELSE replace(source_snapshot_id, ?1, ?2) END,
                status, created_at, updated_at
         FROM ai_candidates WHERE project_id = ?1",
        params![project_id, target_id],
    )?;
    let chapter_documents = {
        let mut statement = transaction.prepare(
            "SELECT id, chapter_plan_id, title, content, status, revision, created_at, updated_at
             FROM chapter_documents WHERE project_id = ?1 ORDER BY created_at ASC",
        )?;
        statement
            .query_map([project_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, i64>(6)?,
                    row.get::<_, i64>(7)?,
                ))
            })?
            .collect::<Result<Vec<_>, _>>()?
    };
    for document in chapter_documents {
        let new_document_id = format!("chapter_document_{}", Uuid::new_v4());
        transaction.execute(
            "INSERT INTO chapter_documents(id, project_id, chapter_plan_id, title, content, status, revision, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![new_document_id, target_id, document.1, document.2, document.3, document.4, document.5, document.6, document.7],
        )?;
        let versions = {
            let mut statement = transaction.prepare(
                "SELECT revision, title, content, source, created_at FROM chapter_versions
                 WHERE chapter_document_id = ?1 ORDER BY revision ASC",
            )?;
            statement
                .query_map([&document.0], |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, i64>(4)?,
                    ))
                })?
                .collect::<Result<Vec<_>, _>>()?
        };
        for version in versions {
            transaction.execute(
                "INSERT INTO chapter_versions(id, chapter_document_id, revision, title, content, source, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![format!("chapter_version_{}", Uuid::new_v4()), new_document_id, version.0, version.1, version.2, version.3, version.4],
            )?;
        }
    }
    transaction.execute(
        "INSERT INTO context_snapshots(id, project_id, scope_kind, scope_id, visible_through_ordinal, payload_json, created_at)
         SELECT 'context_' || lower(hex(randomblob(16))), ?2, scope_kind, scope_id, visible_through_ordinal, payload_json, created_at
         FROM context_snapshots WHERE project_id = ?1",
        params![project_id, target_id],
    )?;
    transaction.execute(
        "INSERT INTO consistency_reports(id, project_id, chapter_plan_id, chapter_document_revision, report_json, created_at)
         SELECT 'consistency_report_' || lower(hex(randomblob(16))), ?2, chapter_plan_id, chapter_document_revision, report_json, created_at
         FROM consistency_reports WHERE project_id = ?1",
        params![project_id, target_id],
    )?;
    transaction.commit()?;
    get_project(connection, &target_id)
}

pub fn project_source_count(
    connection: &Connection,
    project_id: &str,
) -> Result<i64, DesktopError> {
    connection
        .query_row(
            "SELECT count(*) FROM source_documents WHERE project_id = ?1",
            [project_id],
            |row| row.get(0),
        )
        .map_err(DesktopError::from)
}

pub fn rebase_project_source_paths(
    connection: &Connection,
    project_id: &str,
    sources_directory: &Path,
) -> Result<(), DesktopError> {
    if !sources_directory.is_absolute() || !sources_directory.is_dir() {
        return Err(DesktopError::Validation(
            "复制项目的原始文件目录无效".into(),
        ));
    }
    let sources = {
        let mut statement = connection
            .prepare("SELECT id, original_path FROM source_documents WHERE project_id = ?1")?;
        statement
            .query_map([project_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?
    };
    let transaction = connection.unchecked_transaction()?;
    for (document_id, original_path) in sources {
        let file_name = Path::new(&original_path)
            .file_name()
            .ok_or_else(|| DesktopError::Validation("原始文件路径缺少文件名".into()))?;
        let target = sources_directory.join(file_name);
        if !target.is_file() {
            return Err(DesktopError::Validation("复制后的原始文件不完整".into()));
        }
        transaction.execute(
            "UPDATE source_documents SET original_path = ?2 WHERE id = ?1",
            params![document_id, target.to_string_lossy()],
        )?;
    }
    transaction.commit()?;
    Ok(())
}

pub fn purge_project_after_failed_copy(
    connection: &Connection,
    project_id: &str,
) -> Result<(), DesktopError> {
    connection.execute("DELETE FROM projects WHERE id = ?1", [project_id])?;
    Ok(())
}

pub fn create_project_checkpoint(
    connection: &Connection,
    project_id: &str,
    checkpoint_id: &str,
    name: &str,
    package_path: &Path,
    byte_size: i64,
) -> Result<ProjectCheckpointRecord, DesktopError> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 100 {
        return Err(DesktopError::Validation(
            "检查点名称需为 1 至 100 个字符".into(),
        ));
    }
    if byte_size <= 0 || !package_path.is_absolute() || !package_path.is_file() {
        return Err(DesktopError::Validation("检查点文件无效".into()));
    }
    let exists: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM projects WHERE id = ?1 AND trashed_at IS NULL)",
        [project_id],
        |row| row.get(0),
    )?;
    if !exists {
        return Err(DesktopError::Validation("检查点目标项目不存在".into()));
    }
    let now = unix_timestamp()?;
    connection.execute(
        "INSERT INTO project_checkpoints(id, project_id, name, package_path, byte_size, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            checkpoint_id,
            project_id,
            name,
            package_path.to_string_lossy(),
            byte_size,
            now
        ],
    )?;
    get_project_checkpoint(connection, checkpoint_id)
}

pub fn list_project_checkpoints(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<ProjectCheckpointRecord>, DesktopError> {
    let mut statement = connection.prepare(
        "SELECT id, project_id, name, byte_size, created_at FROM project_checkpoints
         WHERE project_id = ?1 ORDER BY created_at DESC, id DESC",
    )?;
    statement
        .query_map([project_id], |row| {
            Ok(ProjectCheckpointRecord {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                byte_size: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(DesktopError::from)
}

pub fn get_project_checkpoint_path(
    connection: &Connection,
    checkpoint_id: &str,
) -> Result<String, DesktopError> {
    connection
        .query_row(
            "SELECT package_path FROM project_checkpoints WHERE id = ?1",
            [checkpoint_id],
            |row| row.get(0),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                DesktopError::Validation("项目检查点不存在".into())
            }
            other => DesktopError::Database(other),
        })
}

fn get_project_checkpoint(
    connection: &Connection,
    checkpoint_id: &str,
) -> Result<ProjectCheckpointRecord, DesktopError> {
    connection
        .query_row(
            "SELECT id, project_id, name, byte_size, created_at FROM project_checkpoints WHERE id = ?1",
            [checkpoint_id],
            |row| {
                Ok(ProjectCheckpointRecord {
                    id: row.get(0)?,
                    project_id: row.get(1)?,
                    name: row.get(2)?,
                    byte_size: row.get(3)?,
                    created_at: row.get(4)?,
                })
            },
        )
        .map_err(DesktopError::from)
}

fn get_project(connection: &Connection, project_id: &str) -> Result<ProjectRecord, DesktopError> {
    connection
        .query_row(
            "SELECT id, title, genre, language, target_word_count, status, created_at, updated_at, trashed_at FROM projects WHERE id = ?1",
            [project_id],
            |row| Ok(ProjectRecord { id: row.get(0)?, title: row.get(1)?, genre: row.get(2)?, language: row.get(3)?, target_word_count: row.get(4)?, status: row.get(5)?, created_at: row.get(6)?, updated_at: row.get(7)?, trashed_at: row.get(8)? }),
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => DesktopError::Validation("项目不存在".into()),
            other => DesktopError::Database(other),
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrates_and_persists_projects() {
        let connection = open_database(Path::new(":memory:")).expect("open database");
        let project = create_project(
            &connection,
            CreateProjectInput {
                title: "  雾港来信  ".into(),
                genre: "悬疑".into(),
                language: "zh-CN".into(),
                target_word_count: Some(300_000),
            },
        )
        .expect("create project");
        assert_eq!(project.title, "雾港来信");
        let projects = list_projects(&connection).expect("list projects");
        assert_eq!(projects.len(), 1);
        assert_eq!(projects[0].id, project.id);
        let checkpoint_path =
            std::env::temp_dir().join(format!("checkpoint-{}.shengpian", Uuid::new_v4()));
        std::fs::write(&checkpoint_path, b"checkpoint").unwrap();
        let checkpoint = create_project_checkpoint(
            &connection,
            &project.id,
            &Uuid::new_v4().to_string(),
            "第一幕完成",
            &checkpoint_path,
            10,
        )
        .expect("create checkpoint");
        assert_eq!(checkpoint.name, "第一幕完成");
        assert_eq!(
            list_project_checkpoints(&connection, &project.id)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            get_project_checkpoint_path(&connection, &checkpoint.id).unwrap(),
            checkpoint_path.to_string_lossy()
        );
        let trashed = trash_project(&connection, &project.id).expect("move to trash");
        assert!(trashed.trashed_at.is_some());
        assert!(list_projects(&connection).unwrap().is_empty());
        assert_eq!(list_trashed_projects(&connection).unwrap().len(), 1);
        let restored = restore_trashed_project(&connection, &project.id).expect("restore project");
        assert!(restored.trashed_at.is_none());
        assert_eq!(list_projects(&connection).unwrap().len(), 1);
        assert!(list_trashed_projects(&connection).unwrap().is_empty());
        std::fs::remove_file(checkpoint_path).unwrap();
    }

    #[test]
    fn rejects_invalid_project_input() {
        let connection = open_database(Path::new(":memory:")).expect("open database");
        let error = create_project(
            &connection,
            CreateProjectInput {
                title: " ".into(),
                genre: "".into(),
                language: "zh-CN".into(),
                target_word_count: None,
            },
        )
        .expect_err("invalid project must fail");
        assert!(error.to_string().contains("不能为空"));
    }

    #[test]
    fn persists_consistency_reports_by_project_and_chapter() {
        let connection = open_database(Path::new(":memory:")).expect("open database");
        let first = create_project(
            &connection,
            CreateProjectInput {
                title: "雾港来信".into(),
                genre: "悬疑".into(),
                language: "zh-CN".into(),
                target_word_count: None,
            },
        )
        .expect("create first project");
        let second = create_project(
            &connection,
            CreateProjectInput {
                title: "星砂纪事".into(),
                genre: "科幻".into(),
                language: "zh-CN".into(),
                target_word_count: None,
            },
        )
        .expect("create second project");
        let saved = save_consistency_report(
            &connection,
            SaveConsistencyReportInput {
                project_id: first.id.clone(),
                chapter_plan_id: "chapter-1".into(),
                chapter_document_revision: Some(3),
                report: serde_json::json!({ "summary": "发现一处时间冲突", "issues": [] }),
            },
        )
        .expect("save report");
        assert_eq!(saved.chapter_document_revision, Some(3));
        assert_eq!(
            list_consistency_reports(&connection, &first.id, "chapter-1")
                .expect("list reports")
                .len(),
            1
        );
        assert!(
            list_consistency_reports(&connection, &first.id, "chapter-2")
                .expect("isolate chapter")
                .is_empty()
        );
        assert!(
            list_consistency_reports(&connection, &second.id, "chapter-1")
                .expect("isolate project")
                .is_empty()
        );
        assert!(
            save_consistency_report(
                &connection,
                SaveConsistencyReportInput {
                    project_id: first.id,
                    chapter_plan_id: "chapter-1".into(),
                    chapter_document_revision: Some(0),
                    report: serde_json::json!({}),
                },
            )
            .is_err()
        );
    }

    #[test]
    fn persists_worker_import_as_project_scoped_source() {
        let mut connection = open_database(Path::new(":memory:")).expect("open database");
        let project = create_project(
            &connection,
            CreateProjectInput {
                title: "雾港来信".into(),
                genre: "悬疑".into(),
                language: "zh-CN".into(),
                target_word_count: None,
            },
        )
        .expect("create project");
        let payload = serde_json::json!({
            "ok": true,
            "result": {
                "document": { "projectId": project.id, "fileName": "novel.txt", "format": "txt", "byteSize": 12, "sha256": "abcdef0123456789abcdef0123456789", "parserVersion": "worker-1", "encoding": "utf-8" },
                "chapters": [{ "id": "chapter-1", "ordinal": 0, "title": "第一章", "content": "雾起。", "sourcePath": null }],
                "segments": [{ "id": "segment-1", "chapterId": "chapter-1", "ordinal": 0, "content": "雾起。" }],
                "issues": [{ "code": "VERY_SHORT_CHAPTER", "severity": "info", "message": "正文较短", "chapterId": "chapter-1" }]
            }
        });
        let mut duplicate_payload = payload.clone();
        assert!(
            persist_worker_import(&mut connection, payload.clone(), "/tmp/novel.txt", false,)
                .expect_err("rights confirmation is mandatory")
                .to_string()
                .contains("合法使用或改编权")
        );
        let saved = persist_worker_import(&mut connection, payload, "/tmp/novel.txt", true)
            .expect("persist source");
        assert_eq!(saved.document.project_id, project.id);
        assert_eq!(saved.chapters.len(), 1);
        assert_eq!(saved.segments.len(), 1);
        assert_eq!(saved.document.original_text, "第一章\n雾起。");
        let listed = list_imported_sources(&connection, &project.id).expect("list sources");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].issues[0].code, "VERY_SHORT_CHAPTER");
        let analysis = save_source_analysis(
            &connection,
            SaveSourceAnalysisInput {
                project_id: project.id.clone(),
                source_document_id: saved.document.id.clone(),
                chapter_id: saved.chapters[0].id.clone(),
                value: serde_json::json!({ "summary": "雾中归港", "evidence": [saved.segments[0].id] }),
            },
        )
        .expect("save chapter analysis");
        assert_eq!(analysis.status, "draft");
        assert_eq!(
            list_source_analysis(&connection, &saved.document.id)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            set_source_analysis_status(&connection, &analysis.id, "accepted")
                .unwrap()
                .status,
            "accepted"
        );
        let hits = search_source_segments(&connection, &project.id, "雾起", 10)
            .expect("search imported source");
        assert_eq!(hits.len(), 1);
        assert!(hits[0].segment_id.ends_with("segment-1"));
        assert!(
            search_source_segments(&connection, "another-project", "雾起", 10)
                .expect("isolate project search")
                .is_empty()
        );
        let second_project = create_project(
            &connection,
            CreateProjectInput {
                title: "雾港来信副本".into(),
                genre: "悬疑".into(),
                language: "zh-CN".into(),
                target_word_count: None,
            },
        )
        .expect("create second project");
        duplicate_payload["result"]["document"]["projectId"] = serde_json::json!(second_project.id);
        let duplicate =
            persist_worker_import(&mut connection, duplicate_payload, "/tmp/novel.txt", true)
                .expect("same source can be imported into another project");
        assert_ne!(saved.document.id, duplicate.document.id);
        assert_ne!(saved.chapters[0].id, duplicate.chapters[0].id);
        assert_ne!(saved.segments[0].id, duplicate.segments[0].id);
        let copied_project =
            duplicate_project(&mut connection, &project.id, None).expect("duplicate project");
        assert_eq!(copied_project.title, "雾港来信 副本");
        let copied_sources =
            list_imported_sources(&connection, &copied_project.id).expect("list copied sources");
        assert_eq!(copied_sources.len(), 1);
        assert_ne!(copied_sources[0].document.id, saved.document.id);
        assert_eq!(
            copied_sources[0].document.original_text,
            saved.document.original_text
        );
        let restored_project = create_project(
            &connection,
            CreateProjectInput {
                title: "从备份恢复".into(),
                genre: "悬疑".into(),
                language: "zh-CN".into(),
                target_word_count: None,
            },
        )
        .unwrap();
        let restored = restore_source_snapshot(
            &mut connection,
            &restored_project.id,
            serde_json::to_value(&saved).unwrap(),
            "/tmp/restored.txt",
        )
        .expect("restore parsed source snapshot");
        assert_eq!(restored.document.sha256, saved.document.sha256);
        assert_eq!(
            restored.document.original_text,
            saved.document.original_text
        );
        assert_ne!(restored.document.id, saved.document.id);
        assert_ne!(restored.chapters[0].id, saved.chapters[0].id);
        assert_eq!(restored.segments[0].content, saved.segments[0].content);
    }

    #[test]
    fn revises_parse_snapshot_without_mutating_original_text() {
        let mut connection = open_database(Path::new(":memory:")).expect("open database");
        let project = create_project(
            &connection,
            CreateProjectInput {
                title: "清洗测试".into(),
                genre: "悬疑".into(),
                language: "zh-CN".into(),
                target_word_count: None,
            },
        )
        .unwrap();
        let payload = serde_json::json!({
            "result": {
                "document": { "projectId": project.id, "fileName": "novel.txt", "format": "txt", "byteSize": 30, "sha256": "0123456789abcdef0123456789abcdef", "parserVersion": "worker-1", "encoding": "utf-8" },
                "chapters": [{ "id": "chapter-1", "ordinal": 0, "title": "第一章", "content": "原始正文\n广告", "sourcePath": null }],
                "segments": [{ "id": "segment-1", "chapterId": "chapter-1", "ordinal": 0, "content": "原始正文" }, { "id": "segment-2", "chapterId": "chapter-1", "ordinal": 1, "content": "广告" }],
                "issues": []
            }
        });
        let saved =
            persist_worker_import(&mut connection, payload, "/tmp/clean.txt", true).unwrap();
        let raw_text = saved.document.original_text.clone();
        let mut revised = serde_json::to_value(&saved).unwrap();
        revised["chapters"] = serde_json::json!([{ "id": "edited-chapter", "ordinal": 0, "title": "第一章", "content": "原始正文" }]);
        revised["segments"] = serde_json::json!([{ "id": "edited-segment", "chapterId": "edited-chapter", "ordinal": 0, "content": "原始正文" }]);
        revised["issues"] = serde_json::json!([]);
        let edited = revise_source_snapshot(&mut connection, revised, "移除广告").unwrap();
        assert_eq!(edited.document.original_text, raw_text);
        assert_eq!(edited.chapters[0].content, "原始正文");
        assert_eq!(edited.document.parser_version, "manual-edit/1");
        let revision_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM source_parse_revisions WHERE source_document_id = ?1",
                [&edited.document.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(revision_count, 1);
    }

    #[test]
    fn candidate_requires_acceptance_before_updating_story_bible() {
        let mut connection = open_database(Path::new(":memory:")).expect("open database");
        let project = create_project(
            &connection,
            CreateProjectInput {
                title: "雾港来信".into(),
                genre: "悬疑".into(),
                language: "zh-CN".into(),
                target_word_count: None,
            },
        )
        .expect("create project");
        let candidate = create_candidate(
            &connection,
            CreateCandidateInput {
                project_id: project.id.clone(),
                kind: "synopsis".into(),
                value: serde_json::json!({ "summary": "第一版" }),
                source_snapshot_id: None,
            },
        )
        .expect("create candidate");
        assert_eq!(list_candidates(&connection, &project.id, Some("synopsis")).unwrap().len(), 1);
        assert_eq!(list_candidates(&connection, &project.id, Some("chapter_generation:missing")).unwrap().len(), 0);
        assert!(
            list_story_bible(&connection, &project.id)
                .expect("list before acceptance")
                .is_empty()
        );
        let accepted = accept_candidate(&mut connection, &candidate.id).expect("accept candidate");
        assert_eq!(accepted.revision, 1);
        assert_eq!(accepted.value["summary"], "第一版");

        let second = create_candidate(
            &connection,
            CreateCandidateInput {
                project_id: project.id.clone(),
                kind: "synopsis".into(),
                value: serde_json::json!({ "summary": "第二版" }),
                source_snapshot_id: Some("snapshot-1".into()),
            },
        )
        .expect("create second candidate");
        let revised = accept_candidate(&mut connection, &second.id).expect("accept revision");
        assert_eq!(revised.revision, 2);
        assert_eq!(list_story_bible(&connection, &project.id).unwrap().len(), 1);
        let manually_saved = save_story_bible(
            &connection,
            SaveStoryBibleInput {
                project_id: project.id.clone(),
                kind: "synopsis".into(),
                value: serde_json::json!({ "summary": "手工修订" }),
            },
        )
        .expect("save manual edit");
        assert_eq!(manually_saved.revision, 3);
        assert_eq!(manually_saved.value["summary"], "手工修订");

        let rejected = create_candidate(
            &connection,
            CreateCandidateInput {
                project_id: project.id.clone(),
                kind: "worldbuilding".into(),
                value: serde_json::json!({ "rules": [] }),
                source_snapshot_id: None,
            },
        )
        .expect("create rejected candidate");
        reject_candidate(&connection, &rejected.id).expect("reject candidate");
        assert!(accept_candidate(&mut connection, &rejected.id).is_err());
        let renamed = rename_project(
            &connection,
            RenameProjectInput {
                project_id: project.id.clone(),
                title: "新书名".into(),
            },
        )
        .expect("rename project");
        assert_eq!(renamed.title, "新书名");
        let archived =
            set_project_status(&connection, &project.id, "archived").expect("archive project");
        assert_eq!(archived.status, "archived");
    }

    #[test]
    fn persists_idempotent_ai_tasks_with_optimistic_transitions() {
        let connection = open_database(Path::new(":memory:")).expect("open database");
        let project = create_project(
            &connection,
            CreateProjectInput {
                title: "雾港来信".into(),
                genre: "悬疑".into(),
                language: "zh-CN".into(),
                target_word_count: None,
            },
        )
        .expect("create project");
        let create = |id: &str| CreateAiTaskInput {
            id: id.into(),
            project_id: project.id.clone(),
            kind: "source.analyze".into(),
            provider_id: "anthropic".into(),
            model: "writer".into(),
            idempotency_key: "source-1:v1".into(),
            input_hash: "sha256".into(),
            input: serde_json::json!({ "sourceDocumentId": "source-1" }),
        };
        let task = create_ai_task(&connection, create("task-1")).expect("create task");
        let duplicate = create_ai_task(&connection, create("task-2")).expect("reuse task");
        assert_eq!(task.id, duplicate.id);
        let running = update_ai_task(
            &connection,
            UpdateAiTaskInput {
                task_id: task.id.clone(),
                expected_revision: 0,
                status: "running".into(),
                output: None,
                error: None,
                input_tokens: None,
                output_tokens: None,
                cached_input_tokens: None,
            },
        )
        .expect("start task");
        assert_eq!(running.revision, 1);
        let succeeded = update_ai_task(
            &connection,
            UpdateAiTaskInput {
                task_id: task.id.clone(),
                expected_revision: 1,
                status: "succeeded".into(),
                output: Some(serde_json::json!({ "chapters": 10 })),
                error: None,
                input_tokens: Some(1200),
                output_tokens: Some(340),
                cached_input_tokens: Some(200),
            },
        )
        .expect("finish task");
        assert_eq!(succeeded.output_tokens, Some(340));
        assert_eq!(list_ai_tasks(&connection, &project.id).unwrap().len(), 1);
        assert!(
            update_ai_task(
                &connection,
                UpdateAiTaskInput {
                    task_id: task.id,
                    expected_revision: 1,
                    status: "failed".into(),
                    output: None,
                    error: Some(serde_json::json!({ "code": "late" })),
                    input_tokens: None,
                    output_tokens: None,
                    cached_input_tokens: None,
                },
            )
            .is_err()
        );
    }

    #[test]
    fn versions_chapter_drafts_and_rejects_stale_writes() {
        let mut connection = open_database(Path::new(":memory:")).expect("open database");
        let project = create_project(
            &connection,
            CreateProjectInput {
                title: "雾港来信".into(),
                genre: "悬疑".into(),
                language: "zh-CN".into(),
                target_word_count: None,
            },
        )
        .expect("create project");
        let first = save_chapter_draft(
            &mut connection,
            SaveChapterDraftInput {
                project_id: project.id.clone(),
                chapter_plan_id: "chapter-plan-1".into(),
                title: "第一章".into(),
                content: "第一版正文".into(),
                source: "manual".into(),
                expected_revision: Some(0),
            },
        )
        .expect("save initial draft");
        assert_eq!(first.revision, 1);
        let second = save_chapter_draft(
            &mut connection,
            SaveChapterDraftInput {
                project_id: project.id.clone(),
                chapter_plan_id: "chapter-plan-1".into(),
                title: "第一章".into(),
                content: "第二版正文".into(),
                source: "ai".into(),
                expected_revision: Some(1),
            },
        )
        .expect("save second draft");
        assert_eq!(second.revision, 2);
        assert_eq!(
            list_chapter_versions(&connection, &second.id)
                .unwrap()
                .len(),
            2
        );
        assert!(
            save_chapter_draft(
                &mut connection,
                SaveChapterDraftInput {
                    project_id: project.id.clone(),
                    chapter_plan_id: "chapter-plan-1".into(),
                    title: "第一章".into(),
                    content: "过期写入".into(),
                    source: "manual".into(),
                    expected_revision: Some(1),
                },
            )
            .is_err()
        );
        assert_eq!(
            set_chapter_status(&connection, &second.id, "final")
                .unwrap()
                .status,
            "final"
        );
        assert_eq!(
            list_chapter_drafts(&connection, &project.id).unwrap().len(),
            1
        );
        let snapshot = create_context_snapshot(
            &connection,
            CreateContextSnapshotInput {
                id: "context-1".into(),
                project_id: project.id.clone(),
                scope_kind: "chapter_generation".into(),
                scope_id: "chapter-plan-1".into(),
                visible_through_ordinal: Some(1),
                payload: serde_json::json!({ "sources": ["character-1"] }),
            },
        )
        .expect("save context snapshot");
        assert_eq!(snapshot.payload["sources"][0], "character-1");
        assert_eq!(
            list_context_snapshots(&connection, &project.id, Some("chapter-plan-1"))
                .unwrap()
                .len(),
            1
        );
        let copy = duplicate_project(&mut connection, &project.id, Some("雾港来信副本"))
            .expect("duplicate complete project");
        let copied_drafts = list_chapter_drafts(&connection, &copy.id).unwrap();
        assert_eq!(copied_drafts.len(), 1);
        assert_eq!(copied_drafts[0].content, "第二版正文");
        assert_eq!(copied_drafts[0].status, "final");
        assert_eq!(
            list_chapter_versions(&connection, &copied_drafts[0].id)
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            list_context_snapshots(&connection, &copy.id, Some("chapter-plan-1"))
                .unwrap()
                .len(),
            1
        );
    }
}
