use serde::{Deserialize, Serialize};
use std::path::PathBuf;

pub const MAX_CHARS: usize = 20000;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub text: String,
}

pub struct Notes {
    path: PathBuf,
    pub list: Vec<Note>,
}

impl Notes {
    pub fn load(dir: &std::path::Path) -> Notes {
        let path = dir.join("notes.json");
        let list = std::fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default();
        Notes { path, list }
    }

    fn persist(&self) {
        if let Ok(s) = serde_json::to_string(&self.list) {
            let tmp = self.path.with_extension("tmp");
            if std::fs::write(&tmp, s).is_ok() {
                let _ = std::fs::rename(&tmp, &self.path);
            }
        }
    }

    /// id пустой — новая заметка (новые сверху); иначе обновление.
    pub fn save(&mut self, mut n: Note) -> Note {
        n.text = n.text.chars().take(MAX_CHARS).collect();
        n.title = n.title.chars().take(60).collect();
        if n.title.trim().is_empty() {
            n.title = "Без названия".into();
        }
        if n.id.is_empty() {
            let t = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis())
                .unwrap_or(0);
            n.id = t.to_string();
            self.list.insert(0, n.clone());
        } else if let Some(x) = self.list.iter_mut().find(|x| x.id == n.id) {
            *x = n.clone();
        } else {
            self.list.insert(0, n.clone());
        }
        self.persist();
        n
    }

    pub fn delete(&mut self, id: &str) {
        self.list.retain(|n| n.id != id);
        self.persist();
    }
}
