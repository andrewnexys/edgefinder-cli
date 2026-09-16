use anyhow::{bail, Context, Result};
use chrono::{DateTime, Utc};
use regex::Regex;
use std::{
    io::{self, Write},
    process::{Command, Stdio},
    time::{Duration, Instant},
};
use tokio::time::sleep;

use crate::{
    client::{EdgeFinderClient, LoginUser},
    config,
};

const SUBSCRIPTION_PAGE_URL: &str = "https://chat.edgefinder.io/subscription";

fn prompt(question: &str) -> Result<String> {
    eprint!("{question}");
    io::stderr().flush()?;
    let mut answer = String::new();
    io::stdin().read_line(&mut answer)?;
    Ok(answer.trim().to_owned())
}

fn has_paid_access(user: &LoginUser) -> bool {
    if user.has_unlimited_access {
        return true;
    }
    if !matches!(
        user.subscription_plan.as_deref(),
        Some("starter" | "pro" | "ultimate")
    ) {
        return false;
    }
    if user.subscription_status.as_deref() == Some("active") {
        return true;
    }
    if user.subscription_status.as_deref() != Some("trialing") {
        return false;
    }
    user.trial_ends_at.as_deref().is_none_or(|value| {
        DateTime::parse_from_rfc3339(value)
            .map(|date| date.with_timezone(&Utc) > Utc::now())
            .unwrap_or(true)
    })
}

fn open_browser(url: &str) -> Result<()> {
    let (program, args): (&str, Vec<&str>) = if cfg!(target_os = "macos") {
        ("open", vec![url])
    } else if cfg!(target_os = "windows") {
        ("cmd", vec!["/c", "start", "", url])
    } else {
        ("xdg-open", vec![url])
    };

    Command::new(program)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .with_context(|| format!("Open this URL in your browser:\n  {url}"))?;
    Ok(())
}

pub async fn login(skip_existing_check: bool) -> Result<()> {
    if !skip_existing_check {
        if let Some(key) = config::api_key() {
            let preview = &key[..key.len().min(15)];
            let answer = prompt(&format!(
                "You're already logged in ({preview}...). Log in with a different account? (y/N) "
            ))?;
            if !matches!(answer.to_lowercase().as_str(), "y" | "yes") {
                return Ok(());
            }
        }
    }

    let email = prompt("Enter your email: ")?;
    if !Regex::new(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")?.is_match(&email) {
        bail!("Invalid email format.");
    }

    eprintln!();
    let base_url = config::base_url();
    let started = EdgeFinderClient::start_login(&email, &base_url).await?;
    eprintln!("  Magic link sent to {}", started.email);
    eprintln!("  Check your inbox and click the link to sign in.\n");
    eprintln!("  Waiting for you to click the link...");

    let deadline = Instant::now() + Duration::from_secs(10 * 60);
    let (api_key, user) = loop {
        if Instant::now() >= deadline {
            bail!("Login timed out. Please try again.");
        }
        let result = EdgeFinderClient::poll_login(&started.session_token, &base_url).await?;
        if result.status == "expired" {
            bail!("Login session expired. Please try again.");
        }
        if result.status == "authenticated" {
            if let (Some(api_key), Some(user)) = (result.api_key, result.user) {
                break (api_key, user);
            }
        }
        sleep(Duration::from_secs(2)).await;
    };

    config::set_api_key(api_key.clone())?;
    eprintln!("\n  Authenticated as {}", user.email);
    if has_paid_access(&user) {
        let plan = user.subscription_plan.as_deref().unwrap_or("paid");
        eprintln!(
            "  {} subscription active. You're all set!\n",
            capitalize(plan)
        );
        return Ok(());
    }

    eprintln!("\n  CLI access requires a paid subscription (Starter $20/mo, Pro $50/mo, or Ultimate $150/mo).");
    let answer = prompt("  Open subscription page in your browser? (Y/n) ")?;
    if matches!(answer.to_lowercase().as_str(), "n" | "no") {
        eprintln!("\n  You can upgrade anytime at {SUBSCRIPTION_PAGE_URL}");
        eprintln!("  Note: CLI commands require a paid subscription to work.");
        return Ok(());
    }

    eprintln!("\n  Opening subscription page in your browser...");
    if let Err(error) = open_browser(SUBSCRIPTION_PAGE_URL) {
        eprintln!("  {error}");
    }
    eprintln!("  Waiting for subscription activation...");

    let client = EdgeFinderClient::new(api_key, base_url);
    let deadline = Instant::now() + Duration::from_secs(5 * 60);
    while Instant::now() < deadline {
        if let Ok(status) = client.subscription_status().await {
            let active = status.has_unlimited_access
                || (matches!(
                    status.subscription_plan.as_str(),
                    "starter" | "pro" | "ultimate"
                ) && matches!(status.subscription_status.as_str(), "active" | "trialing"));
            if active {
                eprintln!("\n  Subscription activated! You're all set.\n");
                return Ok(());
            }
        }
        sleep(Duration::from_secs(3)).await;
    }

    eprintln!("\n  Subscription not detected yet.");
    eprintln!("  If you completed checkout, it may take a moment to activate.");
    eprintln!("  Check with: edgefinder status");
    Ok(())
}

pub async fn ensure_authenticated() -> Result<EdgeFinderClient> {
    if config::api_key().is_none() {
        eprintln!("Not logged in. Let's set up your account.\n");
        login(true).await?;
        if config::api_key().is_none() {
            bail!("Login did not complete. Run: edgefinder login");
        }
        eprintln!();
    }
    Ok(EdgeFinderClient::from_config()?)
}

fn capitalize(value: &str) -> String {
    let mut chars = value.chars();
    chars
        .next()
        .map(|first| first.to_uppercase().collect::<String>() + chars.as_str())
        .unwrap_or_default()
}
