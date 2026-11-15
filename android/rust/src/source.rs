//! Источники картинок: страница галереи (HTML/JSON) по URL и локальные папки.
use crate::convert;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use url::Url;

pub const IMG_EXT: [&str; 6] = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
const MAX_SRC: u64 = 40 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(default)]
pub struct Config {
    pub port: u16,
    pub lan: bool,
    pub token: String,
    pub galleries: Vec<String>,
    pub dirs: Vec<String>,
    pub headers: Vec<String>, // «Имя: значение»
    pub max: usize,
}

impl Default for Config {
    fn default() -> Self {
        Config { port: 8765, lan: false, token: String::new(), galleries: vec![], dirs: vec![], headers: vec![], max: 30 }
    }
}

#[derive(Clone)]
pub struct Item {
    pub id: String,
    pub src: String,
    pub title: String,
}

pub struct Converted {
    pub title: String,
    pub tiles: Vec<Vec<u8>>,
    pub b64: Vec<Option<String>>,
}

#[derive(Default)]
pub struct Source {
    items: Mutex<(Vec<Item>, Option<Instant>)>,
    conv: Mutex<(Vec<String>, HashMap<String, std::sync::Arc<Mutex<Converted>>>)>,
}

fn fnv(s: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in s.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{:010x}", h & 0xff_ffff_ffff)
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(30)))
        .build()
        .into()
}

fn http_get(url: &str, headers: &[String], limit: u64) -> Result<(Vec<u8>, String), String> {
    let mut req = agent().get(url).header("User-Agent", "ExameSaverHub/1.2");
    for h in headers {
        if let Some((k, v)) = h.split_once(':') {
            req = req.header(k.trim(), v.trim());
        }
    }
    let mut resp = req.call().map_err(|e| e.to_string())?;
    let ctype = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = resp.body_mut().with_config().limit(limit).read_to_vec().map_err(|e| e.to_string())?;
    Ok((body, ctype))
}

fn is_img(path: &str) -> bool {
    let p = path.to_lowercase();
    IMG_EXT.iter().any(|e| p.ends_with(e))
}

fn base_name(u: &Url) -> String {
    let last = u.path().rsplit('/').next().unwrap_or("");
    percent_encoding::percent_decode_str(last).decode_utf8_lossy().to_string()
}

/// Значения атрибута name="…" (href, src) из HTML без разбора DOM.
pub fn attr_values(html: &str, name: &str) -> Vec<String> {
    let low = html.to_lowercase();
    let pat = format!("{}=", name);
    let (mut out, mut from) = (vec![], 0);
    while let Some(i) = low[from..].find(&pat) {
        let at = from + i;
        from = at + pat.len();
        let prev_ok = at == 0 || low.as_bytes()[at - 1].is_ascii_whitespace();
        let rest = &html[from..];
        let q = rest.chars().next();
        if !prev_ok || !matches!(q, Some('"') | Some('\'')) {
            continue;
        }
        let q = q.unwrap();
        if let Some(end) = rest[1..].find(q) {
            out.push(rest[1..1 + end].to_string());
        }
    }
    out
}

fn list_gallery(url: &str, headers: &[String]) -> Result<Vec<(String, String)>, String> {
    let (data, ctype) = http_get(url, headers, 5 * 1024 * 1024)?;
    let text = String::from_utf8_lossy(&data).to_string();
    let base = Url::parse(url).map_err(|e| e.to_string())?;
    let mut out = vec![];
    if ctype.contains("json") || text.trim_start().starts_with(['[', '{']) {
        if let Ok(j) = serde_json::from_str::<serde_json::Value>(&text) {
            let arr = match &j {
                serde_json::Value::Array(a) => a.clone(),
                serde_json::Value::Object(o) => ["items", "images", "photos", "files"]
                    .iter()
                    .find_map(|k| o.get(*k).and_then(|v| v.as_array().cloned()))
                    .unwrap_or_default(),
                _ => vec![],
            };
            for it in arr {
                let (u, title) = match &it {
                    serde_json::Value::String(s) => (Some(s.clone()), None),
                    serde_json::Value::Object(o) => {
                        let u = ["url", "src", "path", "file", "name"]
                            .iter()
                            .find_map(|k| o.get(*k).and_then(|v| v.as_str()).map(String::from));
                        let t = ["title", "name"].iter().find_map(|k| o.get(*k).and_then(|v| v.as_str()).map(String::from));
                        (u, t)
                    }
                    _ => (None, None),
                };
                if let Some(u) = u {
                    if let Ok(full) = base.join(&u) {
                        let t = title.unwrap_or_else(|| base_name(&full));
                        out.push((full.to_string(), t));
                    }
                }
            }
            return Ok(out);
        }
    }
    // ссылки <a> ведут на полноразмерные файлы, <img> — на миниатюры: берём ссылки, а если их нет — картинки
    let pick = |name: &str| -> Vec<String> {
        attr_values(&text, name).into_iter().filter(|h| is_img(h.split(['?', '#']).next().unwrap_or(h))).collect()
    };
    let mut cand = pick("href");
    if cand.is_empty() {
        cand = pick("src");
    }
    let mut seen = std::collections::HashSet::new();
    for c in cand {
        if let Ok(full) = base.join(&c) {
            let s = full.to_string();
            if seen.insert(s.clone()) {
                let t = base_name(&full);
                out.push((s, t));
            }
        }
    }
    Ok(out)
}

fn list_dir(path: &str) -> Vec<(String, String)> {
    let mut files: Vec<(std::time::SystemTime, String, String)> = vec![];
    if let Ok(rd) = std::fs::read_dir(path) {
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if is_img(&name) && e.path().is_file() {
                let m = e.metadata().and_then(|m| m.modified()).unwrap_or(std::time::UNIX_EPOCH);
                files.push((m, e.path().to_string_lossy().to_string(), name));
            }
        }
    }
    files.sort_by(|a, b| b.0.cmp(&a.0)); // новые сверху
    files.into_iter().map(|(_, p, n)| (p, n)).collect()
}

impl Source {
    pub fn refresh(&self, cfg: &Config, force: bool) -> Result<Vec<Item>, String> {
        {
            let g = self.items.lock().unwrap();
            if !force && !g.0.is_empty() && g.1.map_or(false, |t| t.elapsed() < Duration::from_secs(5)) {
                return Ok(g.0.clone());
            }
        }
        let mut found = vec![];
        let mut err = None;
        for g in &cfg.galleries {
            match list_gallery(g, &cfg.headers) {
                Ok(v) => found.extend(v),
                Err(e) => err = Some(e),
            }
        }
        for d in &cfg.dirs {
            found.extend(list_dir(d));
        }
        if found.is_empty() {
            if let Some(e) = err {
                return Err(e);
            }
        }
        let items: Vec<Item> = found
            .into_iter()
            .take(cfg.max.max(1))
            .map(|(src, title)| Item { id: fnv(&src), src, title })
            .collect();
        *self.items.lock().unwrap() = (items.clone(), Some(Instant::now()));
        Ok(items)
    }

    pub fn find(&self, cfg: &Config, id: &str) -> Result<Item, String> {
        let known = self.items.lock().unwrap().0.iter().find(|i| i.id == id).cloned();
        if let Some(i) = known {
            return Ok(i);
        }
        self.refresh(cfg, true)?.into_iter().find(|i| i.id == id).ok_or_else(|| "Нет такой картинки".to_string())
    }

    pub fn load_image(&self, cfg: &Config, item: &Item) -> Result<image::DynamicImage, String> {
        let data = if item.src.starts_with("http://") || item.src.starts_with("https://") {
            http_get(&item.src, &cfg.headers, MAX_SRC)?.0
        } else {
            std::fs::read(&item.src).map_err(|e| e.to_string())?
        };
        convert::decode(&data)
    }

    pub fn converted(&self, cfg: &Config, id: &str, w: u32, h: u32, gray: bool, rot: &str) -> Result<std::sync::Arc<Mutex<Converted>>, String> {
        let key = format!("{id}|{w}|{h}|{gray}|{rot}");
        if let Some(hit) = self.conv.lock().unwrap().1.get(&key) {
            return Ok(hit.clone());
        }
        let item = self.find(cfg, id)?;
        let img = self.load_image(cfg, &item)?;
        let tiles = convert::tiles(&img, w, h, gray, rot);
        let n = tiles.len();
        let res = std::sync::Arc::new(Mutex::new(Converted { title: item.title, tiles, b64: vec![None; n] }));
        let mut c = self.conv.lock().unwrap();
        if c.0.len() >= 12 {
            let old = c.0.remove(0);
            c.1.remove(&old);
        }
        c.0.push(key.clone());
        c.1.insert(key, res.clone());
        Ok(res)
    }
}
