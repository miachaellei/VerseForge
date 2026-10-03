use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum DesktopError {
    #[error("本地数据库错误：{0}")]
    Database(#[from] rusqlite::Error),
    #[error("本地文件系统错误：{0}")]
    Io(#[from] std::io::Error),
    #[error("无法解析 Worker 输出：{0}")]
    WorkerJson(#[from] serde_json::Error),
    #[error("本地 Worker 执行失败：{0}")]
    Worker(String),
    #[error("输入无效：{0}")]
    Validation(String),
    #[error("系统安全存储错误：{0}")]
    SecureStorage(String),
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandError {
    code: &'static str,
    message: String,
}

impl From<DesktopError> for CommandError {
    fn from(error: DesktopError) -> Self {
        let code = match &error {
            DesktopError::Database(_) => "DATABASE_ERROR",
            DesktopError::Io(_) => "IO_ERROR",
            DesktopError::WorkerJson(_) => "WORKER_JSON_ERROR",
            DesktopError::Worker(_) => "WORKER_ERROR",
            DesktopError::Validation(_) => "VALIDATION_ERROR",
            DesktopError::SecureStorage(_) => "SECURE_STORAGE_ERROR",
        };
        Self {
            code,
            message: error.to_string(),
        }
    }
}

pub type CommandResult<T> = Result<T, CommandError>;
