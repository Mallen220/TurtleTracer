// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
//! Keeps the GitHub token out of the page and makes GitHub requests for it,
//! so the page (and any plugin running in it) never holds the token. A
//! remembered token is kept in the system keychain; the file beside it only
//! records who it belongs to and when it was saved.
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;
use url::Url;

/// A remembered token is forgotten after this many days.
const REMEMBER_DAYS: f64 = 30.0;
const DAY_MS: f64 = 86_400_000.0;
const TIMEOUT: Duration = Duration::from_secs(60);

/// Response headers the page needs (content type and rate limits).
const PASSED_HEADERS: [&str; 5] = [
    "content-type",
    "retry-after",
    "x-ratelimit-limit",
    "x-ratelimit-remaining",
    "x-ratelimit-reset",
];

/// Where the token is kept, so tests can swap the keychain out.
pub trait Keychain: Send + Sync {
    fn get(&self) -> Option<String>;
    fn set(&self, token: &str) -> bool;
    fn delete(&self);
}

pub struct SystemKeychain;

impl SystemKeychain {
    fn entry() -> Option<keyring::Entry> {
        keyring::Entry::new("Turtle Tracer", "github-token").ok()
    }
}

impl Keychain for SystemKeychain {
    fn get(&self) -> Option<String> {
        Self::entry()?.get_password().ok()
    }
    fn set(&self, token: &str) -> bool {
        Self::entry().is_some_and(|e| e.set_password(token).is_ok())
    }
    fn delete(&self) {
        if let Some(entry) = Self::entry() {
            let _ = entry.delete_credential();
        }
    }
}

/// The requests the app makes: reading from the API and
/// raw.githubusercontent.com, committing through GraphQL, and starting a branch.
pub fn is_allowed_request(url: &Url, method: &str) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    let host = url.host_str().unwrap_or("");
    let path = url.path();
    if host == "raw.githubusercontent.com" {
        return method == "GET";
    }
    if host != "api.github.com" {
        return false;
    }
    match method {
        "GET" => path == "/user" || path.starts_with("/repos/"),
        "POST" => {
            if path == "/graphql" {
                return true;
            }
            let parts: Vec<&str> = path.split('/').collect();
            // "", "repos", owner, repo, "git", "refs"
            parts.len() == 6
                && parts[1] == "repos"
                && !parts[2].is_empty()
                && !parts[3].is_empty()
                && parts[4] == "git"
                && parts[5] == "refs"
        }
        _ => false,
    }
}

#[derive(Clone)]
struct Token {
    token: String,
    login: Option<String>,
    remembered: bool,
}

/// What `github-token.json` holds. The Electron app also stored the token
/// there, encrypted in a way only Electron can read; such a file is dropped.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Saved {
    login: Option<String>,
    saved_at: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    token: Option<String>,
}

fn now_ms() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

pub struct GitHub {
    keychain: Box<dyn Keychain>,
    token_file: PathBuf,
    now: fn() -> f64,
    /// None until first loaded; then the token, if there is one.
    current: Mutex<Option<Option<Token>>>,
    client: reqwest::Client,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    has_token: bool,
    remembered: bool,
    login: Option<String>,
}

#[derive(Deserialize, Default)]
pub struct RequestInit {
    method: Option<String>,
    #[serde(default)]
    headers: HashMap<String, String>,
    body: Option<String>,
}

#[derive(Serialize, Default, Debug)]
pub struct Response {
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    headers: Option<HashMap<String, String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

impl Response {
    fn error(message: &str) -> Self {
        Self {
            error: Some(message.into()),
            ..Default::default()
        }
    }
}

impl GitHub {
    pub fn new(keychain: Box<dyn Keychain>, token_file: PathBuf, now: fn() -> f64) -> Self {
        let client = reqwest::Client::builder()
            .timeout(TIMEOUT)
            .user_agent(concat!("TurtleTracer/", env!("CARGO_PKG_VERSION")))
            .build()
            .expect("HTTP client");
        Self {
            keychain,
            token_file,
            now,
            current: Mutex::new(None),
            client,
        }
    }

    pub fn system(token_file: PathBuf) -> Self {
        Self::new(Box::new(SystemKeychain), token_file, now_ms)
    }

    async fn load(&self) -> Option<Token> {
        let mut current = self.current.lock().await;
        if let Some(loaded) = current.as_ref() {
            return loaded.clone();
        }
        let token = self.read_saved().await;
        *current = Some(token.clone());
        token
    }

    async fn read_saved(&self) -> Option<Token> {
        let text = tokio::fs::read_to_string(&self.token_file).await.ok()?;
        let saved: Saved = serde_json::from_str(&text).ok()?;
        let expired = (self.now)() - saved.saved_at > REMEMBER_DAYS * DAY_MS;
        if expired || saved.token.is_some() {
            self.forget().await;
            return None;
        }
        Some(Token {
            token: self.keychain.get()?,
            login: saved.login,
            remembered: true,
        })
    }

    async fn forget(&self) {
        let _ = tokio::fs::remove_file(&self.token_file).await;
        self.keychain.delete();
    }

    pub async fn status(&self) -> Status {
        let token = self.load().await;
        Status {
            has_token: token.is_some(),
            remembered: token.as_ref().is_some_and(|t| t.remembered),
            login: token.and_then(|t| t.login),
        }
    }

    pub async fn set_token(
        &self,
        token: &str,
        remember: bool,
        login: Option<String>,
    ) -> Result<bool, String> {
        let token = token.trim();
        if token.is_empty() {
            return Err("No token given".into());
        }
        self.load().await;
        self.forget().await;
        // Only remember it where the system keychain can protect it.
        let mut remembered = remember && self.keychain.set(token);
        if remembered {
            let saved = Saved {
                login: login.clone(),
                saved_at: (self.now)(),
                token: None,
            };
            let written = async {
                if let Some(dir) = self.token_file.parent() {
                    tokio::fs::create_dir_all(dir).await?;
                }
                tokio::fs::write(&self.token_file, serde_json::to_vec(&saved)?).await
            };
            if written.await.is_err() {
                self.keychain.delete();
                remembered = false;
            }
        }
        *self.current.lock().await = Some(Some(Token {
            token: token.into(),
            login,
            remembered,
        }));
        Ok(remembered)
    }

    pub async fn clear_token(&self) {
        *self.current.lock().await = Some(None);
        self.forget().await;
    }

    /// The request the page asked for, with the token added for the API
    /// (and only there), or why it won't be made.
    async fn build_request(
        &self,
        raw_url: &str,
        init: RequestInit,
    ) -> Result<reqwest::Request, Response> {
        let Ok(url) = Url::parse(raw_url) else {
            return Err(Response::error("That isn't a GitHub address."));
        };
        let method = init.method.as_deref().unwrap_or("GET").to_uppercase();
        if !is_allowed_request(&url, &method) {
            return Err(Response::error(
                "Turtle Tracer doesn't make that request to GitHub.",
            ));
        }
        let is_api = url.host_str() == Some("api.github.com");
        let mut request = self.client.request(
            reqwest::Method::from_bytes(method.as_bytes()).unwrap_or(reqwest::Method::GET),
            url,
        );
        for (name, value) in &init.headers {
            if !name.eq_ignore_ascii_case("authorization") {
                request = request.header(name, value);
            }
        }
        if is_api {
            if let Some(token) = self.load().await {
                request = request.bearer_auth(token.token);
            }
        }
        if method == "POST" {
            if let Some(body) = init.body {
                request = request.body(body);
            }
        }
        request
            .build()
            .map_err(|_| Response::error("That isn't a GitHub address."))
    }

    /// Makes a GitHub request for the page.
    pub async fn request(&self, raw_url: &str, init: RequestInit) -> Response {
        let request = match self.build_request(raw_url, init).await {
            Ok(request) => request,
            Err(refused) => return refused,
        };
        let response = match self.client.execute(request).await {
            Ok(response) => response,
            Err(e) => return Response::error(if e.is_timeout() { "timeout" } else { "network" }),
        };
        let status = response.status().as_u16();
        let headers = PASSED_HEADERS
            .iter()
            .filter_map(|name| {
                let value = response.headers().get(*name)?.to_str().ok()?;
                Some((name.to_string(), value.to_string()))
            })
            .collect();
        let body = match response.text().await {
            Ok(body) => body,
            Err(e) => return Response::error(if e.is_timeout() { "timeout" } else { "network" }),
        };
        Response {
            status: Some(status),
            headers: Some(headers),
            body: Some(body),
            error: None,
        }
    }
}

#[derive(Serialize)]
pub struct SetResult {
    remembered: bool,
}

#[tauri::command]
pub async fn github_token_status(github: tauri::State<'_, GitHub>) -> Result<Status, String> {
    Ok(github.status().await)
}

#[tauri::command]
pub async fn github_token_set(
    github: tauri::State<'_, GitHub>,
    token: String,
    remember: Option<bool>,
    login: Option<String>,
) -> Result<SetResult, String> {
    let remembered = github
        .set_token(&token, remember.unwrap_or(false), login)
        .await?;
    Ok(SetResult { remembered })
}

#[tauri::command]
pub async fn github_token_clear(github: tauri::State<'_, GitHub>) -> Result<(), String> {
    github.clear_token().await;
    Ok(())
}

#[tauri::command]
pub async fn github_fetch(
    github: tauri::State<'_, GitHub>,
    url: String,
    init: Option<RequestInit>,
) -> Result<Response, String> {
    Ok(github.request(&url, init.unwrap_or_default()).await)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex as StdMutex;

    #[derive(Default)]
    struct FakeKeychain {
        token: StdMutex<Option<String>>,
        broken: bool,
    }

    impl Keychain for std::sync::Arc<FakeKeychain> {
        fn get(&self) -> Option<String> {
            self.token.lock().unwrap().clone()
        }
        fn set(&self, token: &str) -> bool {
            if self.broken {
                return false;
            }
            *self.token.lock().unwrap() = Some(token.into());
            true
        }
        fn delete(&self) {
            *self.token.lock().unwrap() = None;
        }
    }

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn allows_only_the_requests_the_app_makes() {
        assert!(is_allowed_request(
            &url("https://api.github.com/user"),
            "GET"
        ));
        assert!(is_allowed_request(
            &url("https://api.github.com/repos/a/b/contents/x"),
            "GET"
        ));
        assert!(is_allowed_request(
            &url("https://api.github.com/graphql"),
            "POST"
        ));
        assert!(is_allowed_request(
            &url("https://api.github.com/repos/a/b/git/refs"),
            "POST"
        ));
        assert!(is_allowed_request(
            &url("https://raw.githubusercontent.com/a/b/main/x"),
            "GET"
        ));

        assert!(!is_allowed_request(
            &url("http://api.github.com/user"),
            "GET"
        ));
        assert!(!is_allowed_request(
            &url("https://api.github.com/user/repos"),
            "POST"
        ));
        assert!(!is_allowed_request(
            &url("https://api.github.com/repos/a/b"),
            "DELETE"
        ));
        assert!(!is_allowed_request(
            &url("https://api.github.com/repos/a/b/git/refs/x"),
            "POST"
        ));
        assert!(!is_allowed_request(
            &url("https://raw.githubusercontent.com/a"),
            "POST"
        ));
        assert!(!is_allowed_request(&url("https://evil.com/repos/a"), "GET"));
        assert!(!is_allowed_request(
            &url("https://api.github.com/gists"),
            "GET"
        ));
    }

    fn bridge(
        dir: &std::path::Path,
        keychain: std::sync::Arc<FakeKeychain>,
        now: fn() -> f64,
    ) -> GitHub {
        GitHub::new(Box::new(keychain), dir.join("github-token.json"), now)
    }

    #[tokio::test]
    async fn remembers_a_token_in_the_keychain_for_thirty_days() {
        let tmp = tempfile::tempdir().unwrap();
        let keychain = std::sync::Arc::new(FakeKeychain::default());
        let github = bridge(tmp.path(), keychain.clone(), || 0.0);
        assert!(github
            .set_token(" tok ", true, Some("me".into()))
            .await
            .unwrap());
        let saved = std::fs::read_to_string(tmp.path().join("github-token.json")).unwrap();
        assert!(
            !saved.contains("tok"),
            "the token itself stays in the keychain"
        );

        let again = bridge(tmp.path(), keychain.clone(), || 0.0);
        let status = again.status().await;
        assert!(status.has_token && status.remembered);
        assert_eq!(status.login.as_deref(), Some("me"));

        let later = bridge(tmp.path(), keychain.clone(), || 31.0 * DAY_MS);
        assert!(!later.status().await.has_token);
        assert!(keychain.get().is_none());
    }

    #[tokio::test]
    async fn keeps_a_token_for_the_session_without_a_keychain() {
        let tmp = tempfile::tempdir().unwrap();
        let keychain = std::sync::Arc::new(FakeKeychain {
            broken: true,
            ..Default::default()
        });
        let github = bridge(tmp.path(), keychain, || 0.0);
        assert!(!github.set_token("tok", true, None).await.unwrap());
        assert!(github.status().await.has_token);
        assert!(!tmp.path().join("github-token.json").exists());
        assert!(github.set_token("  ", true, None).await.is_err());
    }

    #[tokio::test]
    async fn drops_a_token_file_left_by_the_electron_app() {
        let tmp = tempfile::tempdir().unwrap();
        let file = tmp.path().join("github-token.json");
        std::fs::write(&file, r#"{"token":"djEw...","login":"me","savedAt":0}"#).unwrap();
        let github = bridge(
            tmp.path(),
            std::sync::Arc::new(FakeKeychain::default()),
            || 0.0,
        );
        assert!(!github.status().await.has_token);
        assert!(!file.exists());
    }

    #[tokio::test]
    async fn adds_the_token_to_api_requests_only_and_ignores_the_pages() {
        let tmp = tempfile::tempdir().unwrap();
        let github = bridge(
            tmp.path(),
            std::sync::Arc::new(FakeKeychain::default()),
            || 0.0,
        );
        github.set_token("secret", false, None).await.unwrap();
        let init = |method: &str| RequestInit {
            method: Some(method.into()),
            headers: HashMap::from([
                ("Authorization".to_string(), "Bearer page".to_string()),
                ("Accept".to_string(), "application/json".to_string()),
            ]),
            body: Some("{}".into()),
        };

        let api = github
            .build_request("https://api.github.com/graphql", init("post"))
            .await
            .unwrap();
        assert_eq!(api.method(), "POST");
        assert_eq!(api.headers()["authorization"], "Bearer secret");
        assert_eq!(api.headers()["accept"], "application/json");
        assert!(api.body().is_some());

        let raw = github
            .build_request(
                "https://raw.githubusercontent.com/a/b/main/x.turt",
                init("GET"),
            )
            .await
            .unwrap();
        assert!(raw.headers().get("authorization").is_none());
        assert!(raw.body().is_none(), "a GET carries no body");
    }

    #[tokio::test]
    async fn refuses_other_requests_without_sending_them() {
        let tmp = tempfile::tempdir().unwrap();
        let github = bridge(
            tmp.path(),
            std::sync::Arc::new(FakeKeychain::default()),
            || 0.0,
        );
        let r = github.request("not a url", RequestInit::default()).await;
        assert_eq!(r.error.as_deref(), Some("That isn't a GitHub address."));
        let r = github
            .request("https://example.com/", RequestInit::default())
            .await;
        assert_eq!(
            r.error.as_deref(),
            Some("Turtle Tracer doesn't make that request to GitHub.")
        );
    }
}
