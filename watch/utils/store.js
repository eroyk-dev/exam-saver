import { writeFileSync, readFileSync, unlinkSync } from '../shared/fs'

// Лимиты, чтобы не забить память браслета
export const MAX_NOTES = 30
export const MAX_CHARS = 20000

const INDEX_FILE = 'es_index.json'
const CFG_FILE = 'es_cfg.json'

function fileName(id) {
  return 'es_' + id + '.txt'
}

function cleanId(id) {
  return String(id).replace(/[^0-9a-zA-Z]/g, '')
}

function safeParse(str, def) {
  try {
    return str ? JSON.parse(str) : def
  } catch (e) {
    return def
  }
}

export function loadIndex() {
  return safeParse(readFileSync(INDEX_FILE), [])
}

function saveIndex(list) {
  writeFileSync(INDEX_FILE, JSON.stringify(list))
}

export function saveNote(note) {
  const id = cleanId(note.id)
  const text = String(note.text || '').slice(0, MAX_CHARS)
  if (!id || !text) return false
  const title = String(note.title || 'Без названия').slice(0, 60)

  const list = loadIndex().filter((n) => n.id !== id)
  list.unshift({ id, title, len: text.length })
  while (list.length > MAX_NOTES) {
    const old = list.pop()
    unlinkSync(fileName(old.id))
  }
  writeFileSync(fileName(id), text)
  saveIndex(list)
  return true
}

export function getNote(id) {
  return readFileSync(fileName(cleanId(id)))
}

export function deleteNote(id) {
  const cid = cleanId(id)
  unlinkSync(fileName(cid))
  saveIndex(loadIndex().filter((n) => n.id !== cid))
}

// Настройки: font — размер шрифта, first — был ли успешный первый онлайн-запуск
export function getCfg() {
  return Object.assign({ font: 22, first: 0, nsrc: 0, ip: 0, color: 0 }, safeParse(readFileSync(CFG_FILE), {}))
}

export function setCfg(patch) {
  writeFileSync(CFG_FILE, JSON.stringify(Object.assign(getCfg(), patch)))
}
