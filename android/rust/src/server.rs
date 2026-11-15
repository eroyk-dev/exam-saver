//! HTTP-мост. Протокол картинок совместим с tools/gallery_bridge.py: /ping /list /meta /chunk;
//! заметки для сервиса на телефоне: /notes /note.
use crate::{b64, Hub};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tiny_http::{Header, Request, Response};

const CHUNK_MAX: usize = 24000;

fn reply(req: Request, code: u16, v: Value) {
    let h = Header::from_bytes("Content-Type", "application/json; charset=utf-8").unwrap();
    let _ = req.respond(Response::from_string(v.to_string()).with_status_code(code).with_header(h));
}

fn num(q: &HashMap<String, String>, k: &str, def: i64) -> i64 {
    q.get(k).and_then(|s| s.parse().ok()).unwrap_or(def)
}

pub fn handle(hub: &Arc<Hub>, req: Request) {
    let raw = req.url().to_string();
    let url = match url::Url::parse(&format!("http://h{}", raw)) {
        Ok(u) => u,
        Err(_) => return reply(req, 400, json!({"ok": false, "err": "Плохой запрос"})),
    };
    let q: HashMap<String, String> = url.query_pairs().map(|(k, v)| (k.to_string(), v.to_string())).collect();
    let cfg = hub.cfg.lock().unwrap().clone();
    hub.note_hit(&format!("{}", url.path()));

    if !cfg.token.is_empty() {
        let hdr = req.headers().iter().find(|h| h.field.equiv("X-Token")).map(|h| h.value.to_string());
        let given = hdr.or_else(|| q.get("token").cloned()).unwrap_or_default();
        if given != cfg.token {
            return reply(req, 403, json!({"ok": false, "err": "Неверный токен"}));
        }
    }

    match url.path() {
        "/" | "/ping" => reply(req, 200, json!({"ok": true, "name": "ExameSaver Hub", "ver": 2})),
        "/list" => match hub.src.refresh(&cfg, q.get("force").map_or(false, |v| v == "1")) {
            Ok(items) => reply(
                req,
                200,
                json!({"ok": true, "items": items.iter().map(|i| json!({"id": i.id, "title": i.title})).collect::<Vec<_>>()}),
            ),
            Err(e) => reply(req, 500, json!({"ok": false, "err": e})),
        },
        "/meta" | "/chunk" => {
            let id = q.get("id").cloned().unwrap_or_default();
            let w = num(&q, "w", 192).clamp(32, 512) as u32;
            let h = num(&q, "h", 490).clamp(32, 1024) as u32;
            let gray = q.get("mode").map_or(true, |m| m != "color");
            let rot = match q.get("rot").map(String::as_str) {
                Some(r @ ("auto" | "cw" | "ccw" | "none")) => r,
                _ => "auto",
            };
            let res = match hub.src.converted(&cfg, &id, w, h, gray, rot) {
                Ok(r) => r,
                Err(e) => {
                    let code = if e.starts_with("Нет такой") { 404 } else { 500 };
                    return reply(req, code, json!({"ok": false, "err": e.chars().take(160).collect::<String>()}));
                }
            };
            let mut r = res.lock().unwrap();
            if url.path() == "/meta" {
                let sizes: Vec<usize> = r.tiles.iter().map(Vec::len).collect();
                return reply(
                    req,
                    200,
                    json!({"ok": true, "id": id, "title": r.title, "tiles": r.tiles.len(), "sizes": sizes,
                           "w": w, "h": h, "mode": if gray {"gray"} else {"color"}}),
                );
            }
            let t = num(&q, "tile", 0);
            if t < 0 || t as usize >= r.tiles.len() {
                return reply(req, 404, json!({"ok": false, "err": "Нет такой части"}));
            }
            let t = t as usize;
            if r.b64[t].is_none() {
                let s = b64::encode(&r.tiles[t]);
                r.b64[t] = Some(s);
            }
            let b = r.b64[t].as_ref().unwrap();
            let off = (num(&q, "off", 0).max(0) as usize).min(b.len());
            let ln = (num(&q, "len", 12000).clamp(4, CHUNK_MAX as i64) as usize) / 4 * 4;
            let end = (off + ln).min(b.len());
            reply(
                req,
                200,
                json!({"ok": true, "off": off, "n": end - off, "total": b.len(), "done": off + ln >= b.len(), "b64": &b[off..end]}),
            );
        }
        "/notes" => {
            let n = hub.notes.lock().unwrap();
            let items: Vec<Value> = n
                .list
                .iter()
                .map(|x| json!({"id": x.id, "title": x.title, "len": x.text.chars().count()}))
                .collect();
            reply(req, 200, json!({"ok": true, "items": items}));
        }
        "/note" => {
            let id = q.get("id").cloned().unwrap_or_default();
            let n = hub.notes.lock().unwrap();
            match n.list.iter().find(|x| x.id == id) {
                Some(x) => reply(req, 200, json!({"ok": true, "note": x})),
                None => reply(req, 404, json!({"ok": false, "err": "Нет такой заметки"})),
            }
        }
        _ => reply(req, 404, json!({"ok": false, "err": "Неизвестный запрос"})),
    }
}
