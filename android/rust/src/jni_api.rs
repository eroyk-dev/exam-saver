//! JNI-мост для Kotlin (класс com.examesaver.hub.Native). Все данные — строки JSON.
use crate::{notes::Note, source::Config, Hub, Running};
use std::sync::Arc;
use jni::objects::{JClass, JString};
use jni::sys::{jboolean, jbyteArray, jstring};
use jni::JNIEnv;
use serde_json::json;
use std::sync::Mutex;

static RUN: Mutex<Option<Running>> = Mutex::new(None);
static HUB: Mutex<Option<Arc<Hub>>> = Mutex::new(None);

fn s(env: &mut JNIEnv, v: JString) -> String {
    env.get_string(&v).map(|x| x.into()).unwrap_or_default()
}

fn out(env: &mut JNIEnv, v: impl AsRef<str>) -> jstring {
    env.new_string(v.as_ref()).map(|x| x.into_raw()).unwrap_or(std::ptr::null_mut())
}

fn hub() -> Result<Arc<Hub>, String> {
    HUB.lock().unwrap().clone().ok_or_else(|| "не инициализировано".to_string())
}

/// Открывает хранилище (настройки и заметки) в каталоге; сервер при этом не запускается.
#[no_mangle]
pub extern "system" fn Java_com_examesaver_hub_Native_init(mut env: JNIEnv, _c: JClass, dir: JString) {
    let dir = s(&mut env, dir);
    let mut g = HUB.lock().unwrap();
    if g.is_none() {
        *g = Some(Arc::new(Hub::open(std::path::Path::new(&dir))));
    }
}

/// Запуск (или перезапуск) сервера с текущими настройками; пустая строка — успех.
#[no_mangle]
pub extern "system" fn Java_com_examesaver_hub_Native_start(mut env: JNIEnv, _c: JClass) -> jstring {
    let mut g = RUN.lock().unwrap();
    if let Some(r) = g.take() {
        r.stop();
    }
    let msg = match hub().and_then(crate::serve) {
        Ok(r) => {
            *g = Some(r);
            String::new()
        }
        Err(e) => e,
    };
    out(&mut env, msg)
}

#[no_mangle]
pub extern "system" fn Java_com_examesaver_hub_Native_stop(_env: JNIEnv, _c: JClass) {
    if let Some(r) = RUN.lock().unwrap().take() {
        r.stop();
    }
}

#[no_mangle]
pub extern "system" fn Java_com_examesaver_hub_Native_status(mut env: JNIEnv, _c: JClass) -> jstring {
    let v = match RUN.lock().unwrap().as_ref() {
        Some(r) => json!({"running": true, "addr": r.addr.to_string(), "hits": r.hub.hits.load(std::sync::atomic::Ordering::Relaxed),
                          "log": r.hub.log.lock().unwrap().iter().rev().take(12).collect::<Vec<_>>()}),
        None => json!({"running": false, "hits": 0, "log": []}),
    };
    out(&mut env, v.to_string())
}

#[no_mangle]
pub extern "system" fn Java_com_examesaver_hub_Native_getConfig(mut env: JNIEnv, _c: JClass) -> jstring {
    let v = hub().map(|h| h.cfg.lock().unwrap().clone()).unwrap_or_default();
    out(&mut env, serde_json::to_string(&v).unwrap_or_default())
}

/// Сохраняет настройки; смена порта/LAN применяется при перезапуске (Kotlin вызывает start).
#[no_mangle]
pub extern "system" fn Java_com_examesaver_hub_Native_setConfig(mut env: JNIEnv, _c: JClass, json: JString) -> jstring {
    let js = s(&mut env, json);
    let msg = match (serde_json::from_str::<Config>(&js), hub()) {
        (Ok(c), Ok(h)) => {
            h.set_config(c);
            String::new()
        }
        (Err(e), _) => e.to_string(),
        (_, Err(e)) => e,
    };
    out(&mut env, msg)
}

#[no_mangle]
pub extern "system" fn Java_com_examesaver_hub_Native_notes(mut env: JNIEnv, _c: JClass) -> jstring {
    let v = hub().map(|h| h.notes.lock().unwrap().list.clone()).unwrap_or_default();
    out(&mut env, serde_json::to_string(&v).unwrap_or("[]".into()))
}

#[no_mangle]
pub extern "system" fn Java_com_examesaver_hub_Native_saveNote(mut env: JNIEnv, _c: JClass, json: JString) -> jstring {
    let js = s(&mut env, json);
    let r = match (serde_json::from_str::<Note>(&js), hub()) {
        (Ok(n), Ok(h)) => h.notes.lock().unwrap().save(n).id,
        _ => String::new(),
    };
    out(&mut env, r)
}

#[no_mangle]
pub extern "system" fn Java_com_examesaver_hub_Native_deleteNote(mut env: JNIEnv, _c: JClass, id: JString) {
    let id = s(&mut env, id);
    if let Ok(h) = hub() {
        h.notes.lock().unwrap().delete(&id);
    }
}

/// {"ok":true,"items":[{id,title}]} или {"ok":false,"err":…}
#[no_mangle]
pub extern "system" fn Java_com_examesaver_hub_Native_gallery(mut env: JNIEnv, _c: JClass, force: jboolean) -> jstring {
    let v = match hub() {
        Ok(h) => {
            let cfg = h.cfg.lock().unwrap().clone();
            match h.src.refresh(&cfg, force != 0) {
                Ok(items) => json!({"ok": true, "items": items.iter().map(|i| json!({"id": i.id, "title": i.title})).collect::<Vec<_>>()}),
                Err(e) => json!({"ok": false, "err": e}),
            }
        }
        Err(e) => json!({"ok": false, "err": e}),
    };
    out(&mut env, v.to_string())
}

/// JPEG-превью картинки для экрана «Галерея»; пустой массив при ошибке.
#[no_mangle]
pub extern "system" fn Java_com_examesaver_hub_Native_preview(mut env: JNIEnv, _c: JClass, id: JString) -> jbyteArray {
    let id = s(&mut env, id);
    let bytes = hub()
        .and_then(|h| {
            let cfg = h.cfg.lock().unwrap().clone();
            let item = h.src.find(&cfg, &id)?;
            let img = h.src.load_image(&cfg, &item)?;
            crate::convert::preview_jpeg(&img, 360)
        })
        .unwrap_or_default();
    env.byte_array_from_slice(&bytes).map(|a| a.into_raw()).unwrap_or(std::ptr::null_mut())
}
