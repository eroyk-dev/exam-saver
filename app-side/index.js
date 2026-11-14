import { MessageBuilder } from '../shared/message'

const messageBuilder = new MessageBuilder()
const MAX_CHARS = 20000

function getNotes() {
  try {
    const s = settings.settingsStorage.getItem('notes')
    return s ? JSON.parse(s) : []
  } catch (e) {
    return []
  }
}

function pack(n) {
  return { id: n.id, title: n.title, text: String(n.text || '').slice(0, MAX_CHARS) }
}

const IMG_PATH = { IMG_LIST: '/list', IMG_META: '/meta', IMG_CHUNK: '/chunk' }

// Тонкий прокси к мосту галереи: часы шлют параметры, телефон ходит по HTTP и возвращает JSON
async function bridge(method, params) {
  const st = settings.settingsStorage
  const base = String(st.getItem('brUrl') || 'http://127.0.0.1:8765').trim().replace(/\/+$/, '')
  const token = String(st.getItem('brToken') || '').trim()
  const q = Object.keys(params || {})
    .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(params[k]))
    .join('&')
  try {
    const res = await fetch({
      url: base + IMG_PATH[method] + (q ? '?' + q : ''),
      method: 'GET',
      headers: token ? { 'X-Token': token } : {}
    })
    let b = res && res.body
    if (typeof b === 'string') b = JSON.parse(b)
    return b && typeof b === 'object' ? b : { ok: false, err: 'пустой ответ моста' }
  } catch (e) {
    return { ok: false, err: 'мост недоступен: ' + String((e && e.message) || e).slice(0, 60) }
  }
}

AppSideService({
  onInit() {
    messageBuilder.listen(() => {})

    // Кнопка «Передать на часы» в настройках: пишет ключ push → шлём файл на часы
    settings.settingsStorage.addListener('change', ({ key, newValue }) => {
      if (key !== 'push' || !newValue) return
      try {
        const { id } = JSON.parse(newValue)
        const note = getNotes().find((n) => n.id === id)
        if (note) messageBuilder.call({ type: 'SAVE', note: pack(note) })
      } catch (e) {}
    })

    // Запросы от часов (онлайн-режим)
    messageBuilder.on('request', (ctx) => {
      const payload = messageBuilder.buf2Json(ctx.request.payload)
      if (IMG_PATH[payload.method]) {
        bridge(payload.method, payload.params).then((r) => ctx.response({ data: { result: r } }))
      } else if (payload.method === 'LIST') {
        ctx.response({
          data: {
            result: getNotes().map((n) => ({
              id: n.id,
              title: n.title,
              len: String(n.text || '').length
            }))
          }
        })
      } else if (payload.method === 'GET') {
        const id = (payload.params || {}).id
        const note = getNotes().find((n) => n.id === id)
        ctx.response({ data: { result: note ? pack(note) : null } })
      } else {
        ctx.response({ data: { result: null } })
      }
    })
  },
  onRun() {},
  onDestroy() {}
})
