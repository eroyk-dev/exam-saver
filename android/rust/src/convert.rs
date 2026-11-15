//! Картинка → плитки в формате часов (TGA: ID-поле `SOMH`+ширина, серые 8 бит с палитрой или RGB565).
use image::imageops::{self, FilterType};
use image::{DynamicImage, GrayImage, ImageDecoder, ImageReader, RgbImage};
use std::io::Cursor;

pub const MAX_TILES: u32 = 4;

fn ident(w: u16) -> [u8; 46] {
    let mut id = [0u8; 46];
    id[..4].copy_from_slice(b"SOMH");
    id[4..6].copy_from_slice(&w.to_le_bytes());
    id
}

fn header(w: u16, h: u16, gray: bool) -> Vec<u8> {
    let mut v = Vec::with_capacity(18 + 46 + 1024);
    v.push(46); // длина ID-поля
    v.push(if gray { 1 } else { 0 }); // есть палитра
    v.push(if gray { 1 } else { 2 }); // тип: 1 — с палитрой, 2 — truecolor
    v.extend_from_slice(&0u16.to_le_bytes()); // начало палитры
    v.extend_from_slice(&(if gray { 256u16 } else { 0 }).to_le_bytes());
    v.push(if gray { 32 } else { 0 }); // бит на запись палитры
    v.extend_from_slice(&[0, 0, 0, 0]); // x/y origin
    v.extend_from_slice(&w.to_le_bytes());
    v.extend_from_slice(&h.to_le_bytes());
    v.push(if gray { 8 } else { 16 });
    v.push(0x20); // начало слева сверху
    v.extend_from_slice(&ident(w));
    if gray {
        for g in 0..=255u8 {
            v.extend_from_slice(&[g, g, g, 255]);
        }
    }
    v
}

fn to_tga_gray(img: &GrayImage) -> Vec<u8> {
    let mut v = header(img.width() as u16, img.height() as u16, true);
    v.extend_from_slice(img.as_raw());
    v
}

fn to_tga_color(img: &RgbImage) -> Vec<u8> {
    let mut v = header(img.width() as u16, img.height() as u16, false);
    v.reserve(img.as_raw().len() / 3 * 2);
    for p in img.pixels() {
        let (r, g, b) = (p[0] as u16, p[1] as u16, p[2] as u16);
        let c = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
        v.extend_from_slice(&c.to_le_bytes());
    }
    v
}

pub fn decode(data: &[u8]) -> Result<DynamicImage, String> {
    let reader = ImageReader::new(Cursor::new(data))
        .with_guessed_format()
        .map_err(|e| e.to_string())?;
    let mut dec = reader.into_decoder().map_err(|e| e.to_string())?;
    let orient = dec.orientation().ok();
    let mut img = DynamicImage::from_decoder(dec).map_err(|e| e.to_string())?;
    if let Some(o) = orient {
        img.apply_orientation(o);
    }
    Ok(img)
}

fn flatten_white(img: &DynamicImage) -> RgbImage {
    let rgba = img.to_rgba8();
    let mut out = RgbImage::new(rgba.width(), rgba.height());
    for (x, y, p) in rgba.enumerate_pixels() {
        let a = p[3] as u32;
        let m = |c: u8| ((c as u32 * a + 255 * (255 - a)) / 255) as u8;
        out.put_pixel(x, y, image::Rgb([m(p[0]), m(p[1]), m(p[2])]));
    }
    out
}

// Аналог PIL ImageOps.autocontrast(cutoff=1)
fn autocontrast(img: &mut GrayImage) {
    let mut hist = [0u64; 256];
    img.pixels().for_each(|p| hist[p[0] as usize] += 1);
    let total: u64 = hist.iter().sum();
    let cut = total / 100;
    let (mut lo, mut acc) = (0usize, 0u64);
    while lo < 255 {
        acc += hist[lo];
        if acc > cut {
            break;
        }
        lo += 1;
    }
    let (mut hi, mut acc) = (255usize, 0u64);
    while hi > 0 {
        acc += hist[hi];
        if acc > cut {
            break;
        }
        hi -= 1;
    }
    if hi <= lo {
        return;
    }
    let scale = 255.0 / (hi - lo) as f32;
    for p in img.pixels_mut() {
        let v = ((p[0] as f32 - lo as f32) * scale).round().clamp(0.0, 255.0);
        p[0] = v as u8;
    }
}

/// Возвращает RGB-плитки (ширина w, высота ≤ h) и признак «серые»; сами TGA строит `encode`.
pub fn tiles(img: &DynamicImage, w: u32, h: u32, gray: bool, rot: &str) -> Vec<Vec<u8>> {
    let mut rgb = flatten_white(img);
    let (iw, ih) = rgb.dimensions();
    if rot == "cw" || (rot == "auto" && iw as f32 > ih as f32 * 1.15) {
        rgb = imageops::rotate90(&rgb);
    } else if rot == "ccw" {
        rgb = imageops::rotate270(&rgb);
    }
    let (iw, ih) = rgb.dimensions();
    let (mut nw, mut nh) = (w, ((ih as f64 * w as f64 / iw as f64).round() as u32).max(1));
    if nh > h * MAX_TILES {
        nh = h * MAX_TILES;
        nw = ((iw as f64 * nh as f64 / ih as f64).round() as u32).max(1);
    }
    let rgb = imageops::resize(&rgb, nw, nh, FilterType::Lanczos3);

    let mut out = Vec::new();
    if gray {
        let mut g = imageops::grayscale(&rgb);
        autocontrast(&mut g);
        let mut full = GrayImage::from_pixel(w, nh, image::Luma([255]));
        imageops::replace(&mut full, &g, ((w - nw) / 2) as i64, 0);
        let mut y = 0;
        while y < nh {
            let hh = h.min(nh - y);
            out.push(to_tga_gray(&imageops::crop_imm(&full, 0, y, w, hh).to_image()));
            y += h;
        }
    } else {
        let mut full = RgbImage::from_pixel(w, nh, image::Rgb([255, 255, 255]));
        imageops::replace(&mut full, &rgb, ((w - nw) / 2) as i64, 0);
        let mut y = 0;
        while y < nh {
            let hh = h.min(nh - y);
            out.push(to_tga_color(&imageops::crop_imm(&full, 0, y, w, hh).to_image()));
            y += h;
        }
    }
    out
}

/// Маленькое JPEG-превью для интерфейса приложения (первый экран, цветной).
pub fn preview_jpeg(img: &DynamicImage, w: u32) -> Result<Vec<u8>, String> {
    let rgb = flatten_white(img);
    let (iw, ih) = rgb.dimensions();
    let nh = ((ih as f64 * w as f64 / iw as f64).round() as u32).clamp(1, w * 3);
    let small = imageops::resize(&rgb, w, nh, FilterType::Triangle);
    let mut buf = Vec::new();
    small
        .write_to(&mut Cursor::new(&mut buf), image::ImageFormat::Jpeg)
        .map_err(|e| e.to_string())?;
    Ok(buf)
}
