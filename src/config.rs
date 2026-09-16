use serde::{Deserialize, Serialize};
use std::{env, fs, io, path::PathBuf};

const DEFAULT_BASE_URL: &str = "https://chat.edgefinder.io";

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Config {
    #[serde(skip_serializing_if = "Option::is_none")]
    api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    base_url: Option<String>,
}

pub fn config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".edgefinder")
        .join("config.json")
}

fn read_config() -> Config {
    fs::read_to_string(config_path())
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn write_config(config: &Config) -> io::Result<()> {
    let path = config_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut contents = serde_json::to_string_pretty(config)?;
    contents.push('\n');
    fs::write(&path, contents)?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
    }

    Ok(())
}

pub fn api_key() -> Option<String> {
    env::var("EDGEFINDER_API_KEY")
        .ok()
        .filter(|value| !value.is_empty())
        .or_else(|| read_config().api_key)
}

pub fn base_url() -> String {
    env::var("EDGEFINDER_BASE_URL")
        .ok()
        .filter(|value| !value.is_empty())
        .or_else(|| read_config().base_url)
        .unwrap_or_else(|| DEFAULT_BASE_URL.to_owned())
        .trim_end_matches('/')
        .to_owned()
}

pub fn set_api_key(value: String) -> io::Result<()> {
    let mut config = read_config();
    config.api_key = Some(value);
    write_config(&config)
}

pub fn set_base_url(value: String) -> io::Result<()> {
    let mut config = read_config();
    config.base_url = Some(value.trim_end_matches('/').to_owned());
    write_config(&config)
}

pub fn clear_api_key() -> io::Result<()> {
    let mut config = read_config();
    config.api_key = None;
    write_config(&config)
}

pub struct ConfigSummary {
    pub api_key: Option<String>,
    pub base_url: String,
    pub config_path: PathBuf,
}

pub fn summary() -> ConfigSummary {
    ConfigSummary {
        api_key: api_key().map(|key| format!("{}...", &key[..key.len().min(15)])),
        base_url: base_url(),
        config_path: config_path(),
    }
}
