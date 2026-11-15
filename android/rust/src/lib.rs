pub mod b64;
pub mod convert;
pub mod jni_api;
pub mod notes;
pub mod server;
pub mod source;

use notes::Notes;
use source::{Config, Source};
use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

pub struct Hub {
    pub dir: PathBuf,
    pub cfg: Mutex<Config>,
    pub notes: Mutex<Notes>,
    pub src: Source,
    pub log: Mutex<VecDeque<String>>,
    pub hits: AtomicU64,
}

impl Hub {
    pub fn open(dir: &Path) -> Hub {
        let cfg: Config = std::fs::read_to_string(dir.join("config.json"))
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Hub {
            dir: dir.to_path_buf(),
            cfg: Mutex::new(cfg),
            notes: Mutex::new(Notes::load(dir)),
            src: Source::default(),
            log: Mutex::new(VecDeque::new()),
            hits: AtomicU64::new(0),
        }
    }

    pub fn set_config(&self, cfg: Config) {
        if let Ok(s) = serde_json::to_string_pretty(&cfg) {
            let _ = std::fs::write(self.dir.join("config.json"), s);
        }
        *self.cfg.lock().unwrap() = cfg;
    }

    pub fn note_hit(&self, what: &str) {
        self.hits.fetch_add(1, Ordering::Relaxed);
        let mut l = self.log.lock().unwrap();
        if l.len() >= 30 {
            l.pop_front();
        }
        l.push_back(what.to_string());
    }
}

pub struct Running {
    pub hub: Arc<Hub>,
    pub addr: std::net::SocketAddr,
    server: Arc<tiny_http::Server>,
    threads: Vec<std::thread::JoinHandle<()>>,
}

/// Запуск моста. Порт 0 в настройках — любой свободный (для тестов).
pub fn start(dir: &Path) -> Result<Running, String> {
    serve(Arc::new(Hub::open(dir)))
}

pub fn serve(hub: Arc<Hub>) -> Result<Running, String> {
    let cfg = hub.cfg.lock().unwrap().clone();
    let host = if cfg.lan { "0.0.0.0" } else { "127.0.0.1" };
    let server = Arc::new(tiny_http::Server::http(format!("{host}:{}", cfg.port)).map_err(|e| e.to_string())?);
    let addr = server.server_addr().to_ip().ok_or("нет адреса")?;
    let threads = (0..4)
        .map(|_| {
            let (s, h) = (server.clone(), hub.clone());
            std::thread::spawn(move || {
                while let Ok(req) = s.recv() {
                    server::handle(&h, req);
                }
            })
        })
        .collect();
    Ok(Running { hub, addr, server, threads })
}

impl Running {
    pub fn stop(self) {
        for _ in &self.threads {
            self.server.unblock();
        }
        for t in self.threads {
            let _ = t.join();
        }
    }
}
