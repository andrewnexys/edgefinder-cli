use reqwest::{Method, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use thiserror::Error;

use crate::config;

#[derive(Debug, Error)]
pub enum EdgeFinderError {
    #[error("No API key configured. Run: edgefinder login")]
    MissingApiKey,
    #[error("{message}")]
    Api { status: u16, message: String },
    #[error("{0}")]
    Http(#[from] reqwest::Error),
    #[error("{0}")]
    Json(#[from] serde_json::Error),
}

impl EdgeFinderError {
    pub fn status(&self) -> Option<u16> {
        match self {
            Self::Api { status, .. } => Some(*status),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum League {
    Nfl,
    Nba,
    Mlb,
}

impl League {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Nfl => "nfl",
            Self::Nba => "nba",
            Self::Mlb => "mlb",
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ConversationMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatResponse {
    pub response: String,
    #[serde(default)]
    pub conversation_history: Vec<ConversationMessage>,
    pub thread_id: Option<String>,
    pub usage: Option<Usage>,
    #[serde(skip)]
    pub raw: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub tokens_used: u64,
    pub rate_limit_remaining: RateLimitRemaining,
}

#[derive(Debug, Deserialize)]
pub struct RateLimitRemaining {
    pub hour: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionStatus {
    pub subscription_plan: String,
    pub subscription_status: String,
    pub has_unlimited_access: bool,
    pub has_access: bool,
    pub reason: String,
    pub trial_ends_at: Option<String>,
    pub trial_days_left: Option<i64>,
    pub is_trialing: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginStart {
    pub session_token: String,
    pub email: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginUser {
    pub email: String,
    pub subscription_plan: Option<String>,
    pub subscription_status: Option<String>,
    pub has_unlimited_access: bool,
    pub trial_ends_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginPoll {
    pub status: String,
    pub api_key: Option<String>,
    pub user: Option<LoginUser>,
}

#[derive(Clone)]
pub struct EdgeFinderClient {
    api_key: String,
    base_url: String,
    http: reqwest::Client,
}

impl EdgeFinderClient {
    pub fn from_config() -> Result<Self, EdgeFinderError> {
        let key = config::api_key().ok_or(EdgeFinderError::MissingApiKey)?;
        Ok(Self::new(key, config::base_url()))
    }

    pub fn new(api_key: String, base_url: String) -> Self {
        Self {
            api_key,
            base_url: base_url.trim_end_matches('/').to_owned(),
            http: reqwest::Client::new(),
        }
    }

    async fn request(
        &self,
        method: Method,
        path: &str,
        body: Option<Value>,
    ) -> Result<Value, EdgeFinderError> {
        let mut request = self
            .http
            .request(method, format!("{}{}", self.base_url, path))
            .bearer_auth(&self.api_key);
        if let Some(body) = body {
            request = request.json(&body);
        }
        let response = request.send().await?;
        decode_response(response).await
    }

    pub async fn ask(
        &self,
        message: &str,
        league: League,
        conversation_history: &[ConversationMessage],
        thread_id: Option<&str>,
    ) -> Result<ChatResponse, EdgeFinderError> {
        let value = self
            .request(
                Method::POST,
                "/api/v1/chat",
                Some(json!({
                    "message": message,
                    "league": league,
                    "conversationHistory": conversation_history,
                    "threadId": thread_id,
                })),
            )
            .await?;
        let mut response: ChatResponse = serde_json::from_value(value.clone())?;
        response.raw = value;
        Ok(response)
    }

    pub async fn nfl_schedule(&self) -> Result<Value, EdgeFinderError> {
        self.request(Method::GET, "/api/discover/nfl-schedule", None)
            .await
    }

    pub async fn nba_schedule(&self, date: Option<&str>) -> Result<Value, EdgeFinderError> {
        self.get_with_query(
            "/api/discover/nba-schedule",
            &[("date", date.map(str::to_owned))],
        )
        .await
    }

    pub async fn nfl_standings(&self) -> Result<Value, EdgeFinderError> {
        self.request(Method::GET, "/api/discover/nfl-standings", None)
            .await
    }

    pub async fn nba_standings(&self) -> Result<Value, EdgeFinderError> {
        self.request(Method::GET, "/api/discover/nba-standings", None)
            .await
    }

    pub async fn nfl_odds(&self, week: Option<u32>) -> Result<Value, EdgeFinderError> {
        self.get_with_query(
            "/api/discover/nfl-polymarket-odds",
            &[("week", week.map(|v| v.to_string()))],
        )
        .await
    }

    pub async fn nba_odds(&self, date: Option<&str>) -> Result<Value, EdgeFinderError> {
        self.get_with_query(
            "/api/discover/nba-polymarket-odds",
            &[("date", date.map(str::to_owned))],
        )
        .await
    }

    pub async fn portfolio_summary(&self, league: Option<&str>) -> Result<Value, EdgeFinderError> {
        self.get_with_query(
            "/api/portfolio/summary",
            &[("league", league.map(str::to_owned))],
        )
        .await
    }

    pub async fn portfolio_positions(
        &self,
        league: Option<&str>,
    ) -> Result<Value, EdgeFinderError> {
        self.get_with_query(
            "/api/portfolio/positions",
            &[("league", league.map(str::to_owned))],
        )
        .await
    }

    pub async fn portfolio_trades(
        &self,
        league: Option<&str>,
        limit: Option<u32>,
    ) -> Result<Value, EdgeFinderError> {
        self.get_with_query(
            "/api/portfolio/trades",
            &[
                ("league", league.map(str::to_owned)),
                ("limit", limit.map(|value| value.to_string())),
            ],
        )
        .await
    }

    pub async fn portfolio_closed(
        &self,
        league: Option<&str>,
        limit: Option<u32>,
    ) -> Result<Value, EdgeFinderError> {
        self.get_with_query(
            "/api/portfolio/closed",
            &[
                ("league", league.map(str::to_owned)),
                ("limit", limit.map(|value| value.to_string())),
            ],
        )
        .await
    }

    pub async fn subscription_status(&self) -> Result<SubscriptionStatus, EdgeFinderError> {
        let value = self
            .request(Method::GET, "/api/subscription/status", None)
            .await?;
        Ok(serde_json::from_value(value)?)
    }

    pub async fn subscription_status_value(&self) -> Result<Value, EdgeFinderError> {
        self.request(Method::GET, "/api/subscription/status", None)
            .await
    }

    async fn get_with_query(
        &self,
        path: &str,
        params: &[(&str, Option<String>)],
    ) -> Result<Value, EdgeFinderError> {
        let url = format!("{}{}", self.base_url, path);
        let query: Vec<(&str, &str)> = params
            .iter()
            .filter_map(|(key, value)| value.as_deref().map(|value| (*key, value)))
            .collect();
        let response = self
            .http
            .get(url)
            .bearer_auth(&self.api_key)
            .query(&query)
            .send()
            .await?;
        decode_response(response).await
    }

    pub async fn start_login(email: &str, base_url: &str) -> Result<LoginStart, EdgeFinderError> {
        let response = reqwest::Client::new()
            .post(format!(
                "{}/api/v2/auth/cli-login",
                base_url.trim_end_matches('/')
            ))
            .json(&json!({ "email": email }))
            .send()
            .await?;
        let status = response.status();
        let value: Value = response.json().await?;
        if !status.is_success() || value.get("success").and_then(Value::as_bool) != Some(true) {
            return Err(api_error(status, &value));
        }
        Ok(serde_json::from_value(
            value.get("data").cloned().unwrap_or(Value::Null),
        )?)
    }

    pub async fn poll_login(session: &str, base_url: &str) -> Result<LoginPoll, EdgeFinderError> {
        let response = reqwest::Client::new()
            .get(format!(
                "{}/api/v2/auth/cli-poll",
                base_url.trim_end_matches('/')
            ))
            .query(&[("session", session)])
            .send()
            .await?;
        let status = response.status();
        let value: Value = response.json().await?;
        if !status.is_success() {
            return Err(api_error(status, &value));
        }
        Ok(serde_json::from_value(value)?)
    }
}

async fn decode_response(response: reqwest::Response) -> Result<Value, EdgeFinderError> {
    let status = response.status();
    let value: Value = response.json().await?;
    if !status.is_success() {
        return Err(api_error(status, &value));
    }
    Ok(value)
}

fn api_error(status: StatusCode, value: &Value) -> EdgeFinderError {
    let message = value
        .get("message")
        .and_then(Value::as_str)
        .or_else(|| value.get("error").and_then(Value::as_str))
        .or_else(|| value.pointer("/error/message").and_then(Value::as_str))
        .map(str::to_owned)
        .unwrap_or_else(|| format!("HTTP {}", status.as_u16()));
    EdgeFinderError::Api {
        status: status.as_u16(),
        message,
    }
}
