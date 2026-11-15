use hub_core::{notes::Note, source::Config};
use serde_json::Value;

fn make_images(dir: &std::path::Path) {
    std::fs::create_dir_all(dir).unwrap();
    let grad = |w: u32, h: u32| image::RgbImage::from_fn(w, h, |x, y| image::Rgb([(x * 255 / w) as u8, (y * 255 / h) as u8, 128]));
    grad(600, 900).save(dir.join("a_portrait.jpg")).unwrap();
    grad(1200, 600).save(dir.join("b_wide.png")).unwrap();
    grad(400, 3000).save(dir.join("c_long.jpg")).unwrap();
    image::RgbaImage::from_fn(300, 300, |x, _| image::Rgba([200, 30, 30, if x < 150 { 0 } else { 255 }])).save(dir.join("d_alpha.png")).unwrap();
}

fn get(base: &str, path: &str, token: Option<&str>) -> (u16, Value) {
    let agent: ureq::Agent = ureq::Agent::config_builder().http_status_as_error(false).build().into();
    let mut r = agent.get(format!("{base}{path}"));
    if let Some(t) = token {
        r = r.header("X-Token", t);
    }
    let mut resp = r.call().expect("http");
    let code = resp.status().as_u16();
    let s = resp.body_mut().read_to_string().expect("body");
    (code, serde_json::from_str(&s).expect("json"))
}

fn dec(s: &str) -> Vec<u8> {
    let t: Vec<u8> = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/".to_vec();
    let (mut out, mut acc, mut bits) = (vec![], 0u32, 0);
    for c in s.bytes().filter(|c| *c != b'=') {
        acc = acc << 6 | t.iter().position(|x| *x == c).unwrap() as u32;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
        }
    }
    out
}

fn fetch(base: &str, id: &str, mode: &str) -> (Value, Vec<Vec<u8>>) {
    let q = format!("id={id}&w=192&h=490&mode={mode}");
    let (_, m) = get(base, &format!("/meta?{q}"), Some("abc"));
    assert_eq!(m["ok"], true, "{m}");
    let mut tiles = vec![];
    for t in 0..m["tiles"].as_u64().unwrap() {
        let (mut buf, mut off) = (String::new(), 0);
        loop {
            let (_, c) = get(base, &format!("/chunk?{q}&tile={t}&off={off}&len=12000"), Some("abc"));
            assert_eq!(c["ok"], true, "{c}");
            buf.push_str(c["b64"].as_str().unwrap());
            if c["done"] == true {
                break;
            }
            off += 12000;
        }
        let raw = dec(&buf);
        assert_eq!(raw.len() as u64, m["sizes"][t as usize].as_u64().unwrap());
        tiles.push(raw);
    }
    (m, tiles)
}

fn tga(raw: &[u8]) -> (u8, u16, u16, u8) {
    let w = u16::from_le_bytes([raw[12], raw[13]]);
    let h = u16::from_le_bytes([raw[14], raw[15]]);
    assert_eq!(raw[0], 46);
    assert_eq!(&raw[18..22], b"SOMH");
    assert_eq!(u16::from_le_bytes([raw[22], raw[23]]), w);
    assert!(raw[24..64].iter().all(|b| *b == 0));
    assert_eq!(raw[17], 0x20);
    let pal = if raw[1] == 1 { 1024 } else { 0 };
    assert_eq!(raw.len(), 64 + pal + w as usize * h as usize * raw[16] as usize / 8);
    (raw[2], w, h, raw[16])
}

#[test]
fn bridge_end_to_end() {
    let data = std::env::temp_dir().join(format!("hub_test_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&data);
    std::fs::create_dir_all(&data).unwrap();
    make_images(&data.join("pics"));
    let cfg = Config {
        port: 0,
        token: "abc".into(),
        galleries: vec![],
        dirs: vec![data.join("pics").to_string_lossy().to_string()],
        ..Default::default()
    };
    std::fs::write(data.join("config.json"), serde_json::to_string(&cfg).unwrap()).unwrap();
    let run = hub_core::start(&data).unwrap();
    let base = format!("http://{}", run.addr);

    assert_eq!(get(&base, "/ping", None).0, 403);
    assert_eq!(get(&base, "/ping", Some("abc")).1["ok"], true);
    let (_, l) = get(&base, "/list", Some("abc"));
    let items = l["items"].as_array().unwrap();
    let id_of = |n: &str| items.iter().find(|i| i["title"] == n).unwrap_or_else(|| panic!("{n} {l}"))["id"].as_str().unwrap().to_string();
    println!("{} items", items.len());

    for (name, mode, tiles, kind) in [
        ("a_portrait.jpg", "gray", 1, (1u8, 8u8)),
        ("b_wide.png", "gray", 1, (1, 8)),
        ("c_long.jpg", "gray", 3, (1, 8)),
        ("d_alpha.png", "color", 1, (2, 16)),
    ] {
        let (m, t) = fetch(&base, &id_of(name), mode);
        assert_eq!(m["tiles"], tiles, "{name}");
        for x in &t {
            let (ty, w, h, bpp) = tga(x);
            assert_eq!((ty, bpp), kind);
            assert_eq!(w, 192);
            assert!(h <= 490);
        }
        let dims: Vec<_> = t.iter().map(|x| tga(x).2).collect();
        println!("{name}: sizes {} dims {:?}", m["sizes"], dims);
    }
    // длинная режется на экраны, широкая поворачивается (600×1200 → 192×384), портрет 600×900 → 192×288
    let (_, t) = fetch(&base, &id_of("c_long.jpg"), "gray");
    assert_eq!(t.iter().map(|x| tga(x).2).collect::<Vec<_>>(), vec![490, 490, 460]);
    let (_, t) = fetch(&base, &id_of("b_wide.png"), "gray");
    assert_eq!(tga(&t[0]).2, 384);
    let (_, t) = fetch(&base, &id_of("a_portrait.jpg"), "gray");
    assert_eq!(tga(&t[0]).2, 288);

    assert_eq!(get(&base, "/meta?id=nope&w=192&h=490", Some("abc")).0, 404);
    assert_eq!(get(&base, "/chunk?id=nope", Some("abc")).1["ok"], false);

    // заметки
    let n = run.hub.notes.lock().unwrap().save(Note { id: String::new(), title: "Тест".into(), text: "Привет, часы".into() });
    let (_, ln) = get(&base, "/notes", Some("abc"));
    assert_eq!(ln["items"][0]["id"], n.id.as_str());
    assert_eq!(ln["items"][0]["len"], 12);
    let (_, gn) = get(&base, &format!("/note?id={}", n.id), Some("abc"));
    assert_eq!(gn["note"]["text"], "Привет, часы");
    assert_eq!(get(&base, "/note?id=zzz", Some("abc")).0, 404);
    run.stop();
    // заметки пережили перезапуск
    std::fs::write(data.join("config.json"), serde_json::to_string(&cfg).unwrap()).unwrap();
    let run2 = hub_core::start(&data).unwrap();
    assert_eq!(run2.hub.notes.lock().unwrap().list.len(), 1);
    run2.stop();
    let _ = std::fs::remove_dir_all(&data);
}

#[test]
fn html_gallery_listing() {
    let html = r#"<a href="p/one.JPG?x=1">1</a> <img src="thumb/one.jpg"> <a href="doc.pdf">d</a> <img data-src="no.png">"#;
    assert_eq!(hub_core::source::attr_values(html, "href"), vec!["p/one.JPG?x=1", "doc.pdf"]);
    assert_eq!(hub_core::source::attr_values(html, "src"), vec!["thumb/one.jpg"]);
}
