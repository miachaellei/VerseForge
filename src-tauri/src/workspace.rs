use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

use serde_json::Value;
use uuid::Uuid;

use crate::error::DesktopError;

pub struct WorkspaceState {
    pub root: PathBuf,
}

pub fn preserve_source_file(
    root: &Path,
    source_path: &Path,
    project_id: &str,
    worker_payload: &Value,
) -> Result<PathBuf, DesktopError> {
    Uuid::parse_str(project_id).map_err(|_| DesktopError::Validation("桌面项目 ID 无效".into()))?;
    let sha256 = worker_payload
        .pointer("/result/document/sha256")
        .and_then(Value::as_str)
        .ok_or_else(|| DesktopError::Validation("Worker 结果缺少文件哈希".into()))?;
    if sha256.len() != 64
        || !sha256
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err(DesktopError::Validation("Worker 返回的文件哈希无效".into()));
    }
    let extension = source_path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| DesktopError::Validation("导入文件缺少扩展名".into()))?;
    if !matches!(
        extension.as_str(),
        "txt" | "md" | "markdown" | "epub" | "pdf"
    ) {
        return Err(DesktopError::Validation("导入文件扩展名无效".into()));
    }
    let sources_dir = root.join("projects").join(project_id).join("sources");
    fs::create_dir_all(&sources_dir)?;
    let destination = sources_dir.join(format!("{sha256}.{extension}"));
    if destination.is_file() {
        return Ok(destination);
    }
    let temporary = sources_dir.join(format!(".{sha256}.{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut input = fs::File::open(source_path)?;
        let mut output = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        let mut buffer = [0_u8; 64 * 1024];
        loop {
            let count = input.read(&mut buffer)?;
            if count == 0 {
                break;
            }
            output.write_all(&buffer[..count])?;
        }
        output.sync_all()?;
        fs::rename(&temporary, &destination)?;
        Ok(destination.clone())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

pub fn restore_source_text(
    root: &Path,
    project_id: &str,
    sha256: &str,
    text: &str,
) -> Result<PathBuf, DesktopError> {
    Uuid::parse_str(project_id).map_err(|_| DesktopError::Validation("桌面项目 ID 无效".into()))?;
    if sha256.len() != 64
        || !sha256
            .chars()
            .all(|character| character.is_ascii_hexdigit())
    {
        return Err(DesktopError::Validation("项目包原文哈希无效".into()));
    }
    let sources_dir = root.join("projects").join(project_id).join("sources");
    fs::create_dir_all(&sources_dir)?;
    let destination = sources_dir.join(format!("{sha256}.restored.txt"));
    if destination.is_file() {
        return Ok(destination);
    }
    let temporary = sources_dir.join(format!(".{sha256}.{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut output = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        output.write_all(text.as_bytes())?;
        output.sync_all()?;
        fs::rename(&temporary, &destination)?;
        Ok(destination.clone())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

pub fn duplicate_project_sources(
    root: &Path,
    source_project_id: &str,
    target_project_id: &str,
) -> Result<PathBuf, DesktopError> {
    Uuid::parse_str(source_project_id)
        .map_err(|_| DesktopError::Validation("源项目 ID 无效".into()))?;
    Uuid::parse_str(target_project_id)
        .map_err(|_| DesktopError::Validation("目标项目 ID 无效".into()))?;
    if source_project_id == target_project_id {
        return Err(DesktopError::Validation(
            "复制项目必须使用新的项目 ID".into(),
        ));
    }
    let projects_dir = root.join("projects");
    let source_dir = projects_dir.join(source_project_id).join("sources");
    if !source_dir.is_dir() {
        return Err(DesktopError::Validation(
            "源项目的原始文件目录不存在".into(),
        ));
    }
    fs::create_dir_all(&projects_dir)?;
    let target_project_dir = projects_dir.join(target_project_id);
    if target_project_dir.exists() {
        return Err(DesktopError::Validation("目标项目数据目录已存在".into()));
    }
    let staging_dir = projects_dir.join(format!(".{target_project_id}.{}.tmp", Uuid::new_v4()));
    let staging_sources = staging_dir.join("sources");
    let result = (|| {
        fs::create_dir_all(&staging_sources)?;
        for entry in fs::read_dir(&source_dir)? {
            let entry = entry?;
            let metadata = entry.file_type()?;
            if !metadata.is_file() {
                return Err(DesktopError::Validation(
                    "原始文件目录包含不受支持的条目".into(),
                ));
            }
            let file_name = entry.file_name();
            let destination = staging_sources.join(&file_name);
            fs::copy(entry.path(), &destination)?;
            fs::File::open(&destination)?.sync_all()?;
        }
        fs::rename(&staging_dir, &target_project_dir)?;
        Ok(target_project_dir.join("sources"))
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staging_dir);
    }
    result
}

pub fn remove_project_directory(root: &Path, project_id: &str) {
    if Uuid::parse_str(project_id).is_ok() {
        let _ = fs::remove_dir_all(root.join("projects").join(project_id));
    }
}

pub fn write_export_file(path: &Path, bytes: &[u8]) -> Result<(), DesktopError> {
    if !path.is_absolute() || path.file_name().is_none() {
        return Err(DesktopError::Validation("导出必须使用绝对文件路径".into()));
    }
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| DesktopError::Validation("导出文件缺少扩展名".into()))?;
    if !matches!(
        extension.as_str(),
        "txt" | "md" | "markdown" | "docx" | "shengpian"
    ) {
        return Err(DesktopError::Validation("导出文件扩展名无效".into()));
    }
    if bytes.len() > 2 * 1024 * 1024 * 1024usize {
        return Err(DesktopError::Validation("导出文件超过 2GB 限制".into()));
    }
    let parent = path
        .parent()
        .filter(|parent| parent.is_dir())
        .ok_or_else(|| DesktopError::Validation("导出目录不存在".into()))?;
    let temporary = parent.join(format!(".story-export-{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut output = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        output.write_all(bytes)?;
        output.sync_all()?;
        if path.exists() {
            fs::remove_file(path)?;
        }
        fs::rename(&temporary, path)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

pub fn read_project_package(path: &Path) -> Result<Vec<u8>, DesktopError> {
    if !path.is_absolute() || path.extension().and_then(|value| value.to_str()) != Some("shengpian")
    {
        return Err(DesktopError::Validation(
            "请选择扩展名为 .shengpian 的绝对文件路径".into(),
        ));
    }
    let metadata = fs::metadata(path)?;
    if !metadata.is_file() {
        return Err(DesktopError::Validation("项目包不是普通文件".into()));
    }
    if metadata.len() > 512 * 1024 * 1024 {
        return Err(DesktopError::Validation("项目包超过 512MB 安全限制".into()));
    }
    fs::read(path).map_err(DesktopError::from)
}

pub fn write_project_checkpoint(
    root: &Path,
    project_id: &str,
    checkpoint_id: &str,
    bytes: &[u8],
) -> Result<PathBuf, DesktopError> {
    Uuid::parse_str(project_id).map_err(|_| DesktopError::Validation("桌面项目 ID 无效".into()))?;
    Uuid::parse_str(checkpoint_id)
        .map_err(|_| DesktopError::Validation("检查点 ID 无效".into()))?;
    if bytes.is_empty() || bytes.len() > 512 * 1024 * 1024 {
        return Err(DesktopError::Validation("检查点大小无效".into()));
    }
    let directory = root.join("projects").join(project_id).join("checkpoints");
    fs::create_dir_all(&directory)?;
    let destination = directory.join(format!("{checkpoint_id}.shengpian"));
    let temporary = directory.join(format!(".{checkpoint_id}.{}.tmp", Uuid::new_v4()));
    let result = (|| {
        let mut output = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&temporary)?;
        output.write_all(bytes)?;
        output.sync_all()?;
        fs::rename(&temporary, &destination)?;
        Ok(destination.clone())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

pub fn remove_checkpoint_file(path: &Path) {
    let _ = fs::remove_file(path);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn copies_source_into_project_scoped_immutable_path() {
        let root = std::env::temp_dir().join(format!("story-rewriter-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let source = root.join("novel.txt");
        fs::write(&source, "第一章\n雾起。").unwrap();
        let project_id = Uuid::new_v4().to_string();
        let hash = "a".repeat(64);
        let payload = serde_json::json!({ "result": { "document": { "sha256": hash } } });
        let saved = preserve_source_file(&root, &source, &project_id, &payload).unwrap();
        assert_eq!(fs::read_to_string(&saved).unwrap(), "第一章\n雾起。");
        assert!(saved.starts_with(root.join("projects").join(&project_id).join("sources")));
        assert_eq!(
            preserve_source_file(&root, &source, &project_id, &payload).unwrap(),
            saved
        );
        fs::remove_dir_all(&root).unwrap();
    }

    #[test]
    fn writes_exports_atomically_and_rejects_unknown_extensions() {
        let root = std::env::temp_dir().join(format!("story-export-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let target = root.join("novel.txt");
        write_export_file(&target, "第一版".as_bytes()).unwrap();
        write_export_file(&target, "第二版".as_bytes()).unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "第二版");
        assert!(write_export_file(&root.join("novel.exe"), b"data").is_err());
        let package = root.join("backup.shengpian");
        fs::write(&package, b"package").unwrap();
        assert_eq!(read_project_package(&package).unwrap(), b"package");
        assert!(read_project_package(&root.join("novel.txt")).is_err());
        let project_id = Uuid::new_v4().to_string();
        let checkpoint_id = Uuid::new_v4().to_string();
        let checkpoint =
            write_project_checkpoint(&root, &project_id, &checkpoint_id, b"PK checkpoint").unwrap();
        assert!(checkpoint.ends_with(format!("{checkpoint_id}.shengpian")));
        assert_eq!(read_project_package(&checkpoint).unwrap(), b"PK checkpoint");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn duplicates_project_sources_into_an_independent_directory() {
        let root = std::env::temp_dir().join(format!("story-copy-test-{}", Uuid::new_v4()));
        let source_id = Uuid::new_v4().to_string();
        let target_id = Uuid::new_v4().to_string();
        let source_dir = root.join("projects").join(&source_id).join("sources");
        fs::create_dir_all(&source_dir).unwrap();
        fs::write(source_dir.join("source.txt"), "原作正文").unwrap();
        let copied = duplicate_project_sources(&root, &source_id, &target_id).unwrap();
        assert_eq!(
            fs::read_to_string(copied.join("source.txt")).unwrap(),
            "原作正文"
        );
        fs::write(source_dir.join("source.txt"), "源项目后续变化").unwrap();
        assert_eq!(
            fs::read_to_string(copied.join("source.txt")).unwrap(),
            "原作正文"
        );
        fs::remove_dir_all(root).unwrap();
    }
}
