use std::path::{Path, PathBuf};
use std::io::{BufRead, BufReader, Read};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use serde_json::Value;

use crate::error::DesktopError;

fn worker_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../services/local-worker")
}

fn bundled_worker() -> Option<PathBuf> {
    if let Some(path) = std::env::var_os("STORY_WORKER_BINARY").map(PathBuf::from) {
        if path.is_absolute() && path.is_file() {
            return Some(path);
        }
    }
    let directory = std::env::current_exe().ok()?.parent()?.to_owned();
    let names: &[&str] = if cfg!(windows) {
        &["story-worker.exe", "story-worker"]
    } else {
        &["story-worker"]
    };
    names
        .iter()
        .map(|name| directory.join(name))
        .find(|path| path.is_file())
}

pub fn parse_document(path: &str, project_id: &str) -> Result<Value, DesktopError> {
    let cancelled = AtomicBool::new(false);
    parse_document_with_cancel(path, project_id, &cancelled)
}

pub fn parse_document_with_cancel(
    path: &str,
    project_id: &str,
    cancelled: &AtomicBool,
) -> Result<Value, DesktopError> {
    parse_document_with_observer(path, project_id, cancelled, None)
}

pub fn parse_document_with_observer(
    path: &str,
    project_id: &str,
    cancelled: &AtomicBool,
    observer: Option<std::sync::Arc<dyn Fn(&str) + Send + Sync>>,
) -> Result<Value, DesktopError> {
    if project_id.trim().is_empty() {
        return Err(DesktopError::Validation("项目 ID 不能为空".into()));
    }
    let document = Path::new(path);
    if !document.is_absolute() || !document.is_file() {
        return Err(DesktopError::Validation(
            "必须选择存在的绝对文件路径".into(),
        ));
    }
    let mut command = if let Some(worker) = bundled_worker() {
        let mut command = Command::new(worker);
        command
            .arg("parse-document")
            .arg(document)
            .arg("--project-id")
            .arg(project_id);
        command
    } else {
        let python = std::env::var("STORY_WORKER_PYTHON").unwrap_or_else(|_| "python3".into());
        let mut command = Command::new(python);
        command
            .arg("-m")
            .arg("story_worker")
            .arg("parse-document")
            .arg(document)
            .arg("--project-id")
            .arg(project_id)
            .current_dir(worker_root());
        command
    };
    let mut child = command.stdout(Stdio::piped()).stderr(Stdio::piped()).spawn()?;
    let stdout = child.stdout.take().expect("worker stdout pipe");
    let stderr = child.stderr.take().expect("worker stderr pipe");
    let stdout_reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut reader = stdout;
        let _ = reader.read_to_end(&mut bytes);
        bytes
    });
    let stderr_reader = std::thread::spawn(move || {
        let mut bytes = Vec::new();
        let mut reader = BufReader::new(stderr);
        let mut line = String::new();
        loop {
            line.clear();
            match reader.read_line(&mut line) {
                Ok(0) => break,
                Ok(_) => {
                    if let Some(callback) = observer.as_ref() {
                        callback(line.trim_end());
                    }
                    bytes.extend_from_slice(line.as_bytes());
                }
                Err(_) => break,
            }
        }
        bytes
    });
    let status = loop {
        if cancelled.load(Ordering::Relaxed) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(DesktopError::Worker("导入已取消".into()));
        }
        if let Some(status) = child.try_wait()? {
            break status;
        }
        std::thread::sleep(Duration::from_millis(50));
    };
    let stdout_bytes = stdout_reader.join().unwrap_or_default();
    let stderr_bytes = stderr_reader.join().unwrap_or_default();
    let output = std::process::Output { status, stdout: stdout_bytes, stderr: stderr_bytes };
    if !output.status.success() {
        let message = String::from_utf8_lossy(&output.stderr).trim().to_owned();
        return Err(DesktopError::Worker(if message.is_empty() {
            format!("退出码：{}", output.status)
        } else {
            message
        }));
    }
    let payload: Value = serde_json::from_slice(&output.stdout)?;
    if payload.get("ok").and_then(Value::as_bool) != Some(true) {
        return Err(DesktopError::Worker("Worker 未返回成功结果".into()));
    }
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_relative_paths_before_spawning_worker() {
        let error =
            parse_document("relative.txt", "project-1").expect_err("relative path must fail");
        assert!(error.to_string().contains("绝对文件路径"));
    }
}
