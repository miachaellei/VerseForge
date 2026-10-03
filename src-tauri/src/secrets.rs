use keyring::v1::{Entry, Error as KeyringError};
use serde::Serialize;

use crate::error::DesktopError;

const SERVICE: &str = "com.shengpian.storyrewriter.model-api";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecureStoreHealth {
    pub available: bool,
    pub backend: &'static str,
}

pub fn health() -> SecureStoreHealth {
    SecureStoreHealth {
        available: Entry::store_status().is_ok(),
        backend: if cfg!(target_os = "macos") {
            "macos-keychain"
        } else if cfg!(target_os = "windows") {
            "windows-credential-manager"
        } else {
            "secret-service"
        },
    }
}

pub fn save(provider_id: &str, api_key: &str) -> Result<(), DesktopError> {
    let account = validate_provider_id(provider_id)?;
    if api_key.trim().is_empty() {
        return Err(DesktopError::Validation("API Key 不能为空".into()));
    }
    entry(account)?.set_password(api_key).map_err(map_error)
}

pub fn load(provider_id: &str) -> Result<Option<String>, DesktopError> {
    let account = validate_provider_id(provider_id)?;
    match entry(account)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(map_error(error)),
    }
}

pub fn delete(provider_id: &str) -> Result<(), DesktopError> {
    let account = validate_provider_id(provider_id)?;
    match entry(account)?.delete_credential() {
        Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
        Err(error) => Err(map_error(error)),
    }
}

fn entry(account: &str) -> Result<Entry, DesktopError> {
    Entry::new(SERVICE, account).map_err(map_error)
}

fn validate_provider_id(value: &str) -> Result<&str, DesktopError> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 128
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.')
        })
    {
        return Err(DesktopError::Validation("模型服务商标识无效".into()));
    }
    Ok(value)
}

fn map_error(error: KeyringError) -> DesktopError {
    DesktopError::SecureStorage(error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_provider_account_names() {
        assert_eq!(
            validate_provider_id("openai-compatible").unwrap(),
            "openai-compatible"
        );
        assert!(validate_provider_id("../../unsafe").is_err());
        assert!(validate_provider_id(" ").is_err());
    }

    #[test]
    #[cfg(any(target_os = "macos", target_os = "windows"))]
    fn native_secure_store_initializes() {
        let status = health();
        assert!(
            status.available,
            "native credential store must be available"
        );
    }
}
