use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashMap, sync::Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;
#[cfg(target_os = "android")]
use tauri_plugin_android_native::AndroidNativeExt;
#[cfg(target_os = "ios")]
use tauri_plugin_ios_native::IosNativeExt;

const SERVICE: &str = "moodle_mobile_app";
const SCHEME: &str = "zenith";

#[derive(Clone, Serialize, Deserialize)]
struct Session {
    site: String,
    token: String,
    #[serde(default)]
    private_token: Option<String>,
}

#[derive(Default)]
struct AppState {
    session: Mutex<Option<Session>>,
    last_autologin: Mutex<Option<std::time::Instant>>,
}

/// Where the login session is kept: the OS keychain (Windows, macOS, iOS, Linux).
#[cfg(not(target_os = "android"))]
mod secret {
    use tauri::AppHandle;
    fn entry() -> Result<keyring::Entry, String> {
        keyring::Entry::new("zenith", "session").map_err(|e| e.to_string())
    }
    pub fn set(_: &AppHandle, v: &str) {
        if let Ok(e) = entry() {
            let _ = e.set_password(v);
        }
    }
    pub fn get(_: &AppHandle) -> Option<String> {
        entry().ok()?.get_password().ok()
    }
    pub fn del(_: &AppHandle) {
        if let Ok(e) = entry() {
            let _ = e.delete_credential();
        }
    }
}

/// Android has no keyring backend: the login is encrypted with a key that stays in the Android Keystore, which is backed
/// by the phone's secure hardware when it has any (see the android-native plugin).
#[cfg(target_os = "android")]
mod secret {
    use tauri::{AppHandle, Manager};
    use tauri_plugin_android_native::AndroidNativeExt;
    pub fn set(app: &AppHandle, v: &str) {
        if let Err(e) = app.android_native().secret_set(v) {
            eprintln!("could not save the login: {e}");
        }
    }
    pub fn get(app: &AppHandle) -> Option<String> {
        // an earlier build kept the login as a plain file: don't leave it lying around
        if let Ok(d) = app.path().app_data_dir() {
            let _ = std::fs::remove_file(d.join("session.json"));
        }
        app.android_native().secret_get()
    }
    pub fn del(app: &AppHandle) {
        app.android_native().secret_delete()
    }
}

fn normalize_site(input: &str) -> String {
    let mut s = input.trim().to_string();
    if !s.starts_with("http://") && !s.starts_with("https://") {
        s = format!("https://{s}");
    }
    let start = s.find("://").map(|i| i + 3).unwrap_or(0);
    // cut known Moodle sub-paths, but only on whole path segments (so "/mycampus" is preserved)
    let mut cut_at = s.len();
    for cut in [
        "/login",
        "/my",
        "/course",
        "/index.php",
        "/webservice",
        "/admin",
    ] {
        for (i, _) in s[start..].match_indices(cut) {
            let rest = &s[start + i + cut.len()..];
            if rest.is_empty() || rest.starts_with(['/', '?', '#']) {
                cut_at = cut_at.min(start + i);
                break;
            }
        }
    }
    s.truncate(cut_at);
    s.trim_end_matches('/').to_string()
}

/// A password or token must never travel over plain http, so only https sites are accepted.
fn require_https(site: &str) -> Result<(), String> {
    if site.starts_with("https://") {
        Ok(())
    } else {
        Err("Only https:// sites are supported, so your login is never sent unencrypted.".into())
    }
}

/// Same scheme + host + port as the site. A plain `starts_with` would accept "https://moodle.uni.edu.evil.com".
fn same_origin(site: &str, url: &str) -> bool {
    match (reqwest::Url::parse(site), reqwest::Url::parse(url)) {
        (Ok(a), Ok(b)) => a.origin() == b.origin(),
        _ => false,
    }
}

fn store(app: &AppHandle, session: Session) {
    if let Ok(json) = serde_json::to_string(&session) {
        secret::set(app, &json);
    }
    *app.state::<AppState>().session.lock().unwrap() = Some(session);
}

/// Returns { site, config } where config.typeoflogin: 1=app, 2=browser SSO, 3=embedded
#[tauri::command]
async fn resolve_site(input: String) -> Result<Value, String> {
    let site = normalize_site(&input);
    require_https(&site)?;
    let body = serde_json::json!([{ "index": 0, "methodname": "tool_mobile_get_public_config", "args": {} }]);
    let client = reqwest::Client::builder()
        .user_agent("Zenith/0.2")
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(format!("{site}/lib/ajax/service-nologin.php"))
        .query(&[("info", "tool_mobile_get_public_config")])
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Can't reach {site}: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let v: Value = serde_json::from_str(&text).map_err(|_| {
        format!(
            "{site} didn't return Moodle JSON (HTTP {status}). Is the URL the Moodle base address?"
        )
    })?;
    let first = v.get(0).ok_or("Empty response from site")?;
    if first["error"].as_bool().unwrap_or(false) {
        let msg = first["exception"]["message"]
            .as_str()
            .unwrap_or("unknown error");
        return Err(format!("Site rejected the request: {msg}"));
    }
    // Use the site's canonical address: Moodle builds file URLs from $CFG->wwwroot, and the login signature is
    // made from it too. The address the user typed may be an alias that redirects.
    let canonical = first["data"]["httpswwwroot"]
        .as_str()
        .filter(|s| s.starts_with("https://"))
        .or_else(|| {
            first["data"]["wwwroot"]
                .as_str()
                .filter(|s| s.starts_with("https://"))
        })
        .map(|s| normalize_site(s))
        .unwrap_or(site);
    Ok(serde_json::json!({ "site": canonical, "config": first["data"] }))
}

#[tauri::command]
fn start_sso(app: AppHandle, site: String, wwwroot: Option<String>) -> Result<(), String> {
    require_https(&site)?;
    let passport = uuid::Uuid::new_v4().simple().to_string();
    // Moodle signs the callback with md5($CFG->wwwroot . $passport), which can differ from the address the user
    // typed (www, redirects, proxy). Keep the site's own wwwroot for the signature.
    let signature_site = wwwroot.filter(|w| !w.is_empty()).unwrap_or_else(|| site.clone());
    save_pending(&pending_dir(&app)?, &site, &signature_site, &passport)?;
    let url = format!(
        "{site}/admin/tool/mobile/launch.php?service={SERVICE}&passport={passport}&urlscheme={SCHEME}"
    );
    launch(&app, &url)
}

/// The login attempt (site, passport) is kept on disk, because Android can close the app while the browser is open: the
/// callback then starts the app again and still has to match the attempt it belongs to.
fn pending_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}
fn save_pending(dir: &std::path::Path, site: &str, signature_site: &str, passport: &str) -> Result<(), String> {
    std::fs::write(
        dir.join("sso_pending.json"),
        format!("{site}\n{signature_site}\n{passport}"),
    )
    .map_err(|e| e.to_string())
}
/// Reading leaves the attempt in place, so a stale callback can be followed by the real one; success clears it.
fn read_pending(dir: &std::path::Path) -> Option<(String, String, String)> {
    let text = std::fs::read_to_string(dir.join("sso_pending.json")).ok()?;
    let mut lines = text.lines();
    let site = lines.next()?.to_string();
    let second = lines.next()?.to_string();
    let (signature_site, passport) = match lines.next() {
        Some(passport) => (second, passport.to_string()),
        None => (site.clone(), second), // pending file written by an older version
    };
    Some((site, signature_site, passport))
}
fn clear_pending(dir: &std::path::Path) {
    let _ = std::fs::remove_file(dir.join("sso_pending.json"));
}

fn callback_matches(signature: &str, site: &str, signature_site: &str, passport: &str) -> bool {
    let expected = |base: &str| format!("{:x}", md5::compute(format!("{base}{passport}")));
    signature == expected(signature_site) || signature == expected(site)
}

fn handle_url(app: &AppHandle, url: &str) {
    let Some(b64) = url.strip_prefix(&format!("{SCHEME}://token=")) else {
        return;
    };
    let b64 = b64.trim_end_matches(|c| matches!(c, '/' | '#' | '?'));
    let b64 = b64
        .replace("%3D", "=")
        .replace("%3d", "=")
        .replace("%2B", "+")
        .replace("%2b", "+")
        .replace("%2F", "/")
        .replace("%2f", "/")
        .replace(' ', "+"); // a few browsers turn a literal + into a space
    let decoded = STANDARD
        .decode(b64)
        .ok()
        .and_then(|b| String::from_utf8(b).ok());
    let dir = pending_dir(app).ok();
    let pending = dir.as_ref().and_then(|d| read_pending(d));
    let (Some(decoded), Some((site, signature_site, passport))) = (decoded, pending) else {
        let _ = app.emit("sso-error", "Unexpected login callback");
        return;
    };
    let parts: Vec<&str> = decoded.split(":::").collect();
    if parts.len() < 2 || !callback_matches(parts[0], &site, &signature_site, &passport) {
        let _ = app.emit("sso-error", "Login callback failed verification");
        return;
    }
    if let Some(d) = &dir {
        clear_pending(d);
    }
    store(
        app,
        Session {
            site,
            token: parts[1].to_string(),
            private_token: parts.get(2).map(|p| p.to_string()),
        },
    );
    // bring the app back to the front now that the browser login is done (a phone already does this when the link opens the app)
    #[cfg(desktop)]
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
    let _ = app.emit("sso-complete", ());
}

#[tauri::command]
async fn login_password(
    app: AppHandle,
    site: String,
    username: String,
    password: String,
) -> Result<(), String> {
    require_https(&site)?;
    let res: Value = reqwest::Client::new()
        .post(format!("{site}/login/token.php"))
        .form(&[
            ("username", username),
            ("password", password),
            ("service", SERVICE.to_string()),
        ])
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    match res.get("token").and_then(|t| t.as_str()) {
        Some(t) => {
            store(
                &app,
                Session {
                    site,
                    token: t.into(),
                    private_token: res
                        .get("privatetoken")
                        .and_then(|p| p.as_str())
                        .map(String::from),
                },
            );
            Ok(())
        }
        None => Err(res
            .get("error")
            .and_then(|e| e.as_str())
            .unwrap_or("Login failed")
            .into()),
    }
}

/// Generic Moodle web-service call. Nested params use Moodle's flat syntax, e.g. "courseids[0]".
/// navigator.onLine and the online/offline events are unreliable in the Android WebView, so ask the network:
/// any HTTP answer from the site counts as online.
#[tauri::command]
async fn reachable(state: State<'_, AppState>) -> Result<bool, String> {
    let Some(s) = state.session.lock().unwrap().clone() else { return Ok(true) };
    let c = reqwest::Client::builder().timeout(std::time::Duration::from_secs(5)).build().map_err(|e| e.to_string())?;
    Ok(c.head(&s.site).send().await.is_ok())
}

#[tauri::command]
async fn ws_call(
    state: State<'_, AppState>,
    function: String,
    params: HashMap<String, String>,
) -> Result<Value, String> {
    let s = state
        .session
        .lock()
        .unwrap()
        .clone()
        .ok_or("Not logged in")?;
    let mut form = params;
    form.insert("wstoken".into(), s.token);
    form.insert("wsfunction".into(), function);
    form.insert("moodlewsrestformat".into(), "json".into());
    form.insert("moodlewssettingfilter".into(), "true".into()); // resolves multilingual names/summaries
    // file URLs must point at the token-authenticated endpoint; plain pluginfile.php needs a browser session
    form.insert("moodlewssettingfileurl".into(), "true".into());
    let v: Value = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?
        .post(format!("{}/webservice/rest/server.php", s.site))
        .form(&form)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    if let Some(msg) = v.get("message").and_then(|m| m.as_str()) {
        if v.get("exception").is_some() {
            let code = v.get("errorcode").and_then(|c| c.as_str()).unwrap_or("");
            return Err(if code.is_empty() {
                msg.to_string()
            } else {
                format!("{msg} [{code}]")
            });
        }
    }
    Ok(v)
}

#[derive(Serialize, Deserialize, Clone)]
struct DlEntry {
    path: String,
    course: String,
    name: String,
    size: u64,
    at: u64,
}

fn manifest_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    let d = app.path().app_data_dir().ok()?;
    std::fs::create_dir_all(&d).ok()?;
    Some(d.join("downloads.json"))
}
fn load_manifest(app: &AppHandle) -> Vec<DlEntry> {
    manifest_path(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|j| serde_json::from_str(&j).ok())
        .unwrap_or_default()
}
fn save_manifest(app: &AppHandle, m: &[DlEntry]) {
    if let Some(p) = manifest_path(app) {
        if let Ok(j) = serde_json::to_string(m) {
            let _ = std::fs::write(p, j);
        }
    }
}
fn now_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Records a saved file. `only_new` keeps the original date when a copy was already on disk.
fn track(app: &AppHandle, path: &str, course: &str, name: &str, only_new: bool) {
    let mut m = load_manifest(app);
    if only_new && m.iter().any(|e| e.path == path) {
        return;
    }
    m.retain(|e| e.path != path);
    let size = std::fs::metadata(path).map(|md| md.len()).unwrap_or(0);
    m.push(DlEntry {
        path: path.to_string(),
        course: course.to_string(),
        name: name.to_string(),
        size,
        at: now_secs(),
    });
    save_manifest(app, &m);
}
fn emit_progress(app: &AppHandle, id: &str, done: u64, total: Option<u64>) {
    let _ = app.emit(
        "download-progress",
        serde_json::json!({ "id": id, "done": done, "total": total }),
    );
}

/// Opens a file path or web URL with the OS default handler.
/// Inside an AppImage, AppRun puts the bundle's own libraries and data dirs into the environment. A viewer or
/// browser started with that environment can fail on incompatible libraries (silently, since the launch itself
/// succeeds), so on Linux we start xdg-open ourselves with the bundle's entries stripped out.
fn launch(app: &AppHandle, target: &str) -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        use std::process::{Command, Stdio};
        let mut cmd = Command::new("xdg-open");
        cmd.arg(target)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        if let Some(dir) = std::env::var("APPDIR").ok().filter(|d| !d.is_empty()) {
            for (k, v) in std::env::vars() {
                if matches!(k.as_str(), "APPDIR" | "APPIMAGE" | "ARGV0" | "OWD") {
                    cmd.env_remove(&k);
                    continue;
                }
                if v.contains(&dir) {
                    let kept: Vec<&str> = v
                        .split(':')
                        .filter(|p| !p.starts_with(dir.as_str()))
                        .collect();
                    if kept.is_empty() {
                        cmd.env_remove(&k);
                    } else {
                        cmd.env(&k, kept.join(":"));
                    }
                }
            }
        }
        if let Ok(mut child) = cmd.spawn() {
            std::thread::spawn(move || {
                let _ = child.wait();
            });
            return Ok(());
        }
    }
    if target.starts_with("http://") || target.starts_with("https://") {
        app.opener()
            .open_url(target.to_string(), None::<&str>)
            .map_err(|e| e.to_string())
    } else {
        open_file(app, target)
    }
}

/// The opener plugin can only open URLs on a phone, so a saved file goes to the app the user picks (Android's "open with"
/// list) or to the system viewer (iOS: Quick Look, whose Share button has "Open in…" and "Save to Files").
#[cfg(target_os = "android")]
fn open_file(app: &AppHandle, path: &str) -> Result<(), String> {
    app.android_native().open_file(path)
}
#[cfg(target_os = "ios")]
fn open_file(app: &AppHandle, path: &str) -> Result<(), String> {
    app.ios_native().open_file(path)
}
#[cfg(desktop)]
fn open_file(app: &AppHandle, path: &str) -> Result<(), String> {
    app.opener()
        .open_path(path.to_string(), None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn open_external(app: AppHandle, url: String) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Only web links can be opened".into());
    }
    launch(&app, &url)
}

fn default_dir(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    // A phone has no Downloads folder an app can write to without extra permissions: files stay in the app's own storage
    let (base, name) = if cfg!(mobile) {
        (app.path().app_data_dir(), "downloads")
    } else {
        (app.path().download_dir().or_else(|_| app.path().home_dir()), "Zenith")
    };
    base.map(|p| p.join(name)).map_err(|e| e.to_string())
}
/// `zenith --screenshot`: the UI shows invented courses and a made-up user instead of the real account.
#[tauri::command]
fn screenshot_mode() -> bool {
    std::env::args().any(|a| a == "--screenshot")
}
/// Lets the UI hide what a phone cannot do (choosing a download folder).
#[tauri::command]
fn is_mobile() -> bool {
    cfg!(mobile)
}
#[tauri::command]
fn default_download_dir(app: AppHandle) -> Result<String, String> {
    default_dir(&app).map(|p| p.to_string_lossy().to_string())
}

/// Saves a Moodle file to <dir>/<subdir>/<filename> and opens it with the OS default app.
/// mode: "always" = download every time, "reuse" = open the saved copy if present,
/// "updated" = reuse unless Moodle's copy (timemodified) is newer than the saved file.
#[tauri::command]
async fn download_file(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    url: String,
    dir: String,
    subdir: String,
    filename: String,
    mode: String,
    modified: Option<u64>,
    force: Option<bool>,
) -> Result<Value, String> {
    let s = state
        .session
        .lock()
        .unwrap()
        .clone()
        .ok_or("Not logged in")?;
    if !same_origin(&s.site, &url) {
        return Err("Refusing to download from a different host".into());
    }
    let clean = |x: &str| {
        x.chars()
            .map(|c| if "/\\:*?\"<>|".contains(c) { '_' } else { c })
            .collect::<String>()
            .trim()
            .to_string()
    };
    // empty dir = the default folder (system Downloads/Zenith); the folder is chosen in Settings only
    let mut path = if dir.trim().is_empty() {
        default_dir(&app)?
    } else {
        std::path::PathBuf::from(dir)
    };
    let sub = clean(&subdir);
    path.push(if sub.is_empty() {
        "Moodle".to_string()
    } else {
        sub
    });
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    path.push(clean(&filename));
    let p = path.to_string_lossy().to_string();

    if path.is_file() && mode != "always" && !force.unwrap_or(false) {
        let up_to_date = mode == "reuse"
            || modified.map_or(true, |m| {
                std::fs::metadata(&path)
                    .and_then(|md| md.modified())
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map_or(false, |d| d.as_secs() >= m)
            });
        if up_to_date {
            // adopt a saved copy we don't track yet, so it can be re-downloaded or cleared later
            track(&app, &p, &subdir, &filename, true);
            launch(&app, &p)?;
            return Ok(serde_json::json!({ "path": p, "reused": true }));
        }
    }

    let sep = if url.contains('?') { '&' } else { '?' };
    // no total timeout (big files on slow links are fine); only a stalled connection or transfer gives up
    let client = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(30))
        .read_timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = match client
        .get(format!("{url}{sep}token={}", s.token))
        .send()
        .await
    {
        Ok(r) => r,
        Err(e) => {
            // without a connection, a copy saved earlier is still useful
            if path.is_file() {
                track(&app, &p, &subdir, &filename, true);
                launch(&app, &p)?;
                return Ok(serde_json::json!({ "path": p, "reused": true }));
            }
            return Err(e.to_string());
        }
    };
    let mut resp = resp.error_for_status().map_err(|e| e.to_string())?;
    let is_json = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map_or(false, |t| t.starts_with("application/json"));
    // Moodle can answer 200 with a JSON error instead of the file; don't save that as the file
    if is_json && !filename.to_lowercase().ends_with(".json") {
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        let msg = serde_json::from_slice::<Value>(&bytes)
            .ok()
            .and_then(|v| v["message"].as_str().or(v["error"].as_str()).map(String::from))
            .unwrap_or_else(|| "Moodle returned an error instead of the file".into());
        return Err(msg);
    }
    let total = resp.content_length();
    emit_progress(&app, &id, 0, total);
    // write beside the target and rename, so an interrupted write never leaves a truncated "saved" file
    let mut part = path.clone().into_os_string();
    part.push(".part");
    let part = std::path::PathBuf::from(part);
    let mut file = std::fs::File::create(&part).map_err(|e| e.to_string())?;
    use std::io::Write;
    let mut done = 0u64;
    let mut last = std::time::Instant::now();
    loop {
        match resp.chunk().await {
            Ok(Some(chunk)) => {
                if let Err(e) = file.write_all(&chunk) {
                    drop(file);
                    let _ = std::fs::remove_file(&part);
                    return Err(e.to_string());
                }
                done += chunk.len() as u64;
                // a chunk is small; only report often enough for a readable bar
                if last.elapsed() >= std::time::Duration::from_millis(150) || Some(done) == total {
                    emit_progress(&app, &id, done, total);
                    last = std::time::Instant::now();
                }
            }
            Ok(None) => break,
            Err(e) => {
                drop(file);
                let _ = std::fs::remove_file(&part);
                return Err(e.to_string());
            }
        }
    }
    if let Err(e) = file.flush() {
        let _ = std::fs::remove_file(&part);
        return Err(e.to_string());
    }
    drop(file);
    std::fs::rename(&part, &path).map_err(|e| {
        let _ = std::fs::remove_file(&part);
        e.to_string()
    })?;
    emit_progress(&app, &id, done, total);

    // remember what we saved, so "clear downloads" only ever touches our own files
    track(&app, &p, &subdir, &filename, false);

    launch(&app, &p)?;
    Ok(serde_json::json!({ "path": p, "reused": false }))
}

#[tauri::command]
fn list_downloads(app: AppHandle) -> Vec<DlEntry> {
    let mut m = load_manifest(&app);
    m.retain(|e| std::path::Path::new(&e.path).is_file());
    for e in m.iter_mut() {
        if let Ok(md) = std::fs::metadata(&e.path) {
            e.size = md.len();
        }
    }
    save_manifest(&app, &m);
    m.sort_by(|a, b| a.course.cmp(&b.course).then(a.name.cmp(&b.name)));
    m
}

/// Deletes the given tracked files (or all tracked files when paths is null). Returns how many were removed.
#[tauri::command]
fn delete_downloads(app: AppHandle, paths: Option<Vec<String>>) -> u64 {
    let mut n = 0u64;
    let mut m = load_manifest(&app);
    m.retain(|e| {
        if paths.as_ref().map_or(false, |p| !p.contains(&e.path)) {
            return true;
        }
        let gone = std::fs::remove_file(&e.path).is_ok() || !std::path::Path::new(&e.path).exists();
        if gone {
            n += 1;
            if let Some(d) = std::path::Path::new(&e.path).parent() {
                let _ = std::fs::remove_dir(d);
            } // only succeeds if empty
        }
        !gone
    });
    save_manifest(&app, &m);
    n
}

#[tauri::command]
fn open_local(app: AppHandle, path: String) -> Result<(), String> {
    launch(&app, &path)
}

/// Shows a saved file in the desktop's file manager. Phones have no user-visible download folder.
#[cfg(desktop)]
#[tauri::command]
fn reveal_file(app: AppHandle, path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err("That file is no longer there".into());
    }
    #[cfg(target_os = "macos")]
    let _ = &app;
    #[cfg(target_os = "macos")]
    {
        use std::process::{Command, Stdio};
        Command::new("open")
            .arg("-R")
            .arg(&path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        use std::process::{Command, Stdio};
        let _ = &app;
        Command::new("explorer")
            .arg(format!("/select,{path}"))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let parent = p.parent().ok_or("That file has no folder")?;
        launch(&app, &parent.to_string_lossy())
    }
}
#[cfg(not(desktop))]
#[tauri::command]
fn reveal_file(_path: String) -> Result<(), String> {
    Err("Not available on this device".into())
}

/// Fetches a Moodle-hosted HTML resource with the token, for the in-app viewer.
#[tauri::command]
async fn fetch_content(state: State<'_, AppState>, url: String) -> Result<String, String> {
    let s = state
        .session
        .lock()
        .unwrap()
        .clone()
        .ok_or("Not logged in")?;
    if !same_origin(&s.site, &url) {
        return Err("Refusing to load content from a different host".into());
    }
    let mut u = reqwest::Url::parse(&url).map_err(|e| e.to_string())?;
    u.query_pairs_mut().append_pair("token", &s.token);
    let resp = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .map_err(|e| e.to_string())?
        .get(u)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?;
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    // 4 MB is far beyond a normal resource page and keeps a wrong file from freezing the UI
    if bytes.len() > 4 * 1024 * 1024 {
        return Err("That page is too large to show in the app".into());
    }
    String::from_utf8(bytes.to_vec()).map_err(|_| "That file is not readable HTML".into())
}

/// Uploads one local file into the user's Moodle draft area and returns the draft item id (reuse it for more files).
#[tauri::command]
async fn upload_draft_file(
    state: State<'_, AppState>,
    path: String,
    itemid: u64,
    userid: u64,
) -> Result<u64, String> {
    let s = state
        .session
        .lock()
        .unwrap()
        .clone()
        .ok_or("Not logged in")?;
    let p = std::path::Path::new(&path);
    let name = p
        .file_name()
        .ok_or("That is not a file")?
        .to_string_lossy()
        .to_string();
    let bytes = std::fs::read(p).map_err(|e| format!("Can't read {name}: {e}"))?;
    let mut form = HashMap::new();
    form.insert("wstoken", s.token.clone());
    form.insert("wsfunction", "core_files_upload".into());
    form.insert("moodlewsrestformat", "json".into());
    form.insert("component", "user".into());
    form.insert("filearea", "draft".into());
    form.insert("itemid", itemid.to_string());
    form.insert("filepath", "/".into());
    form.insert("filename", name);
    form.insert("filecontent", STANDARD.encode(&bytes));
    form.insert("contextlevel", "user".into());
    form.insert("instanceid", userid.to_string());
    let v: Value = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(15))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?
        .post(format!("{}/webservice/rest/server.php", s.site))
        .form(&form)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    if let Some(msg) = v.get("message").and_then(|m| m.as_str()) {
        if v.get("exception").is_some() {
            return Err(msg.to_string());
        }
    }
    if let Some(msg) = v
        .get("warnings")
        .and_then(|w| w.get(0))
        .and_then(|w| w.get("message"))
        .and_then(|m| m.as_str())
    {
        return Err(msg.to_string());
    }
    v.get("itemid")
        .and_then(|x| x.as_u64())
        .or_else(|| v.as_u64())
        .ok_or_else(|| "Moodle did not accept the file".into())
}

/// Opens a URL in the system browser. For same-site URLs it first asks Moodle for a one-time
/// auto-login key (like the official mobile app) so the browser is logged in. Falls back to the plain URL.
#[tauri::command]
async fn open_authed(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
) -> Result<Option<String>, String> {
    let s = state
        .session
        .lock()
        .unwrap()
        .clone()
        .ok_or("Not logged in")?;
    // Moodle throttles key requests (default 6 min); within that window the browser session from the last one is reused
    let recent = state.last_autologin.lock().unwrap().map_or(false, |t| {
        t.elapsed() < std::time::Duration::from_secs(6 * 60)
    });
    let mut target = url.clone();
    let mut note: Option<String> = None;
    if same_origin(&s.site, &url) && !recent {
        if let Some(pt) = s.private_token.clone() {
            let res: Result<String, String> = async {
                // Moodle only issues auto-login keys to requests that identify as its app (errorcode apprequired), so this one call keeps the MoodleMobile token
                let client = reqwest::Client::builder()
                    .user_agent("Zenith/0.2 MoodleMobile")
                    .build()
                    .map_err(|e| e.to_string())?;
                let endpoint = format!("{}/webservice/rest/server.php", s.site);
                let info: Value = client
                    .post(&endpoint)
                    .form(&[
                        ("wstoken", s.token.as_str()),
                        ("wsfunction", "core_webservice_get_site_info"),
                        ("moodlewsrestformat", "json"),
                    ])
                    .send()
                    .await
                    .map_err(|e| e.to_string())?
                    .json()
                    .await
                    .map_err(|e| e.to_string())?;
                let uid = info["userid"].as_u64().ok_or("no userid")?;
                let v: Value = client
                    .post(&endpoint)
                    .form(&[
                        ("wstoken", s.token.as_str()),
                        ("wsfunction", "tool_mobile_get_autologin_key"),
                        ("moodlewsrestformat", "json"),
                        ("privatetoken", pt.as_str()),
                    ])
                    .send()
                    .await
                    .map_err(|e| e.to_string())?
                    .json()
                    .await
                    .map_err(|e| e.to_string())?;
                let key = v["key"].as_str().ok_or_else(|| {
                    v["message"]
                        .as_str()
                        .or(v["error"].as_str())
                        .unwrap_or("no key returned")
                        .to_string()
                })?;
                let base = v["autologinurl"].as_str().ok_or("no autologin url")?;
                let mut u = reqwest::Url::parse(base).map_err(|e| e.to_string())?;
                u.query_pairs_mut()
                    .append_pair("userid", &uid.to_string())
                    .append_pair("key", key)
                    .append_pair("urltogo", &url);
                Ok(u.to_string())
            }
            .await;
            match res {
                Ok(u) => {
                    target = u;
                    *state.last_autologin.lock().unwrap() = Some(std::time::Instant::now());
                }
                Err(e) => {
                    note = Some(format!(
                        "Browser auto-login unavailable: {e}. Opened the normal page."
                    ))
                }
            }
        } else {
            note = Some(
                "Browser auto-login unavailable: no private token stored. Sign out and in again."
                    .into(),
            );
        }
    }
    launch(&app, &target)?;
    Ok(note)
}

#[derive(Serialize)]
struct UpdateInfo {
    version: String,
    url: String,
    notes: String,
}

fn parse_ver(v: &str) -> Vec<u64> {
    let mut n: Vec<u64> = v
        .trim_start_matches('v')
        .split(['.', '-', '+'])
        .map_while(|p| p.parse::<u64>().ok())
        .collect();
    n.resize(3, 0);
    n
}

/// Checks the latest published GitHub release; returns it only if newer than the running version.
#[tauri::command]
async fn check_update(app: AppHandle) -> Result<Option<UpdateInfo>, String> {
    if cfg!(mobile) {
        return Ok(None); // the app store updates the app; Google Play and the App Store do not allow pointing users elsewhere
    }
    let v: Value = reqwest::Client::builder()
        .user_agent("Zenith-update-check")
        .build()
        .map_err(|e| e.to_string())?
        .get("https://api.github.com/repos/zac06/zenith/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    let tag = v["tag_name"].as_str().ok_or("no tag in release")?;
    let current = app.package_info().version.to_string();
    if parse_ver(tag) > parse_ver(&current) {
        Ok(Some(UpdateInfo {
            version: tag.trim_start_matches('v').to_string(),
            url: v["html_url"]
                .as_str()
                .unwrap_or("https://github.com/zac06/zenith/releases/latest")
                .to_string(),
            notes: v["body"].as_str().unwrap_or("").chars().take(400).collect(),
        }))
    } else {
        Ok(None)
    }
}

/// Restores the session from the OS keychain. Returns { site, token } or null.
#[tauri::command]
fn get_session(app: AppHandle, state: State<AppState>) -> Option<Session> {
    let mut g = state.session.lock().unwrap();
    if g.is_none() {
        *g = secret::get(&app).and_then(|j| serde_json::from_str(&j).ok());
    }
    g.clone()
}

#[tauri::command]
fn logout(app: AppHandle, state: State<AppState>) {
    *state.session.lock().unwrap() = None;
    secret::del(&app);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut app = tauri::Builder::default();
    #[cfg(desktop)]
    {
        app = app.plugin(tauri_plugin_single_instance::init(|_, _, _| {})); // must be first
    }
    #[cfg(target_os = "android")]
    {
        app = app.plugin(tauri_plugin_android_native::init());
    }
    #[cfg(target_os = "ios")]
    {
        app = app.plugin(tauri_plugin_ios_native::init());
    }
    app.plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            app.deep_link().register_all()?; // registers zenith:// at runtime (dev + portable builds)
            let handle = app.handle().clone();
            // If the system closed the app during the browser login, the link that comes back starts it from scratch, and
            // that first link is not delivered as an event: ask for it (before the page loads, so it sees the new login).
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                for u in urls {
                    handle_url(&handle, u.as_str());
                }
            }
            app.deep_link().on_open_url(move |ev| {
                // Android calls this on its UI thread, and handle_url saves the login through a plugin call that needs that
                // same thread to be free (it would wait for itself forever and freeze the app), so it runs on its own thread.
                let urls: Vec<String> = ev.urls().iter().map(|u| u.to_string()).collect();
                let handle = handle.clone();
                std::thread::spawn(move || {
                    for u in urls {
                        handle_url(&handle, &u);
                    }
                });
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            reachable,
            resolve_site,
            start_sso,
            login_password,
            ws_call,
            get_session,
            logout,
            download_file,
            default_download_dir,
            screenshot_mode,
            is_mobile,
            open_external,
            open_authed,
            check_update,
            list_downloads,
            delete_downloads,
            open_local,
            reveal_file,
            fetch_content,
            upload_draft_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Zenith");
}

#[cfg(test)]
mod tests {
    use super::{callback_matches, clear_pending, read_pending, require_https, same_origin, save_pending};
    #[test]
    fn origin_check() {
        let site = "https://moodle.uni.edu/mycampus";
        assert!(same_origin(site, "https://moodle.uni.edu/webservice/pluginfile.php/1/a.pdf"));
        assert!(same_origin(site, "https://moodle.uni.edu:443/x"));
        assert!(!same_origin(site, "https://moodle.uni.edu.evil.com/x"));
        assert!(!same_origin(site, "https://moodle.uni.edu@evil.com/x"));
        assert!(!same_origin(site, "http://moodle.uni.edu/x"));
        assert!(!same_origin(site, "not a url"));
    }
    #[test]
    fn pending_login_survives_a_restart() {
        let dir = std::env::temp_dir().join(format!("zenith-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(read_pending(&dir), None); // nothing started yet
        save_pending(&dir, "https://moodle.uni.edu/mycampus", "https://moodle.uni.edu", "abc123").unwrap();
        assert_eq!(
            read_pending(&dir),
            Some(("https://moodle.uni.edu/mycampus".into(), "https://moodle.uni.edu".into(), "abc123".into()))
        );
        clear_pending(&dir);
        assert_eq!(read_pending(&dir), None); // one attempt answers one callback
        std::fs::remove_dir_all(&dir).unwrap();
    }
    #[test]
    fn callback_accepts_the_site_wwwroot() {
        let passport = "abc123";
        let signature = format!("{:x}", md5::compute(format!("https://canonical.example{passport}")));
        assert!(callback_matches(&signature, "https://typed.example", "https://canonical.example", passport));
        assert!(callback_matches(&signature, "https://canonical.example", "https://canonical.example", passport));
        assert!(!callback_matches(&signature, "https://typed.example", "https://other.example", passport));
        assert!(!callback_matches("not-a-signature", "https://typed.example", "https://canonical.example", passport));
    }
    #[test]
    fn https_only() {
        assert!(require_https("https://moodle.uni.edu").is_ok());
        assert!(require_https("http://moodle.uni.edu").is_err());
        assert!(require_https("ftp://moodle.uni.edu").is_err());
    }
}
