import { writeFileSync, readFileSync, unlinkSync, statSync } from '../shared/fs'
import { getCfg } from './store'

export const MAX_IMGS = 12
const INDEX = 'es_img.json'

// Как путь к файлу из каталога данных превратить в src для IMG на API 1.0 — на разных
// прошивках по-разному, поэтому вариантов несколько; рабочий выбирается на экране «Проверка показа»
export const PATHS = ['%', 'data://%', '/storage/js_apps/data/%', 'storage/js_apps/data/%']

function cid(id) {
  return String(id).replace(/[^0-9a-zA-Z]/g, '')
}

export function tileFile(id, t) {
  return 'es_i' + cid(id) + '_' + t + '.png'
}

export function srcFor(file, style) {
  const st = style == null ? getCfg().ip || 0 : style
  const p = PATHS[st % PATHS.length]
  if (p.indexOf('/storage') === 0 || p.indexOf('storage') === 0) {
    let aid = ''
    try {
      aid = ('00000000' + hmApp.packageInfo().appId.toString(16)).slice(-8).toUpperCase()
    } catch (e) {}
    return p.replace('%', aid + '/' + file)
  }
  return p.replace('%', file)
}

export function loadImgs() {
  try {
    const s = readFileSync(INDEX)
    return s ? JSON.parse(s) : []
  } catch (e) {
    return []
  }
}

function saveImgs(list) {
  writeFileSync(INDEX, JSON.stringify(list))
}

function dropFiles(it) {
  for (let t = 0; t < (it.n || 0); t++) unlinkSync(tileFile(it.id, t))
}

// Запись плитки по частям: open → append(Uint8Array)… → close
export function openTile(id, t) {
  const f = hmFS.open(tileFile(id, t), hmFS.O_CREAT | hmFS.O_RDWR | hmFS.O_TRUNC)
  return { f, pos: 0 }
}

export function appendTile(h, bytes) {
  hmFS.seek(h.f, h.pos, hmFS.SEEK_SET)
  hmFS.write(h.f, bytes.buffer, 0, bytes.length)
  h.pos += bytes.length
}

export function closeTile(h) {
  hmFS.close(h.f)
}

export function tileSize(id, t) {
  const s = statSync(tileFile(id, t))
  return s ? s.size : 0
}

// Фиксируем готовую картинку в индексе (после того как все плитки записаны)
export function commitImg(it) {
  const id = cid(it.id)
  const list = loadImgs().filter((x) => {
    if (x.id === id) {
      if (x.n > it.n) for (let t = it.n; t < x.n; t++) unlinkSync(tileFile(id, t))
      return false
    }
    return true
  })
  list.unshift({ id, title: String(it.title || 'Без названия').slice(0, 60), n: it.n, mode: it.mode, w: it.w })
  while (list.length > MAX_IMGS) dropFiles(list.pop())
  saveImgs(list)
}

export function deleteImg(id) {
  const c = cid(id)
  const list = loadImgs()
  const it = list.find((x) => x.id === c)
  if (it) dropFiles(it)
  saveImgs(list.filter((x) => x.id !== c))
}

// Тестовая картинка 96×96 RGB565 (градиент) в том же формате, что присылает мост
export function writeTestImage() {
  const w = 96
  const h = 96
  const hdr = 18 + 46
  const buf = new Uint8Array(hdr + w * h * 2)
  buf[0] = 46
  buf[2] = 2
  buf[12] = w & 255
  buf[13] = w >> 8
  buf[14] = h & 255
  buf[15] = h >> 8
  buf[16] = 16
  buf[17] = 0x20
  buf[18] = 0x53 // S O M H
  buf[19] = 0x4f
  buf[20] = 0x4d
  buf[21] = 0x48
  buf[22] = w & 255
  buf[23] = w >> 8
  let o = hdr
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = (x * 31) / (w - 1)
      const g = (y * 63) / (h - 1)
      const b = 31 - r
      const v = ((r | 0) << 11) | ((g | 0) << 5) | (b | 0)
      buf[o++] = v & 255
      buf[o++] = v >> 8
    }
  }
  const h0 = openTile('test', 0)
  appendTile(h0, buf)
  closeTile(h0)
}
