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

const IMG_PATH = { IMG_LIST: '/list', IMG_META: '/meta', IMG_CHUNK: '/chunk', HUB_NOTES: '/notes', HUB_NOTE: '/note' }

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

// Вызов Hub, но не дольше 2 с: часы проверяют связь с коротким таймаутом
function hubCall(method, params) {
  return Promise.race([bridge(method, params), new Promise((r) => setTimeout(() => r({ ok: false, err: 'Hub не отвечает' }), 2000))])
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
      } else if (payload.method === 'PING') {
        // Проверка цепочки часы → Zepp → Hub: сюда дошли, значит Zepp на телефоне жив
        const src = (payload.params || {}).src || 0
        if (src === 2) return ctx.response({ data: { result: { zepp: true, hub: null } } })
        hubCall('HUB_NOTES', {}).then((hub) => ctx.response({ data: { result: { zepp: true, hub: !!(hub && hub.ok), err: hub && hub.err } } }))
      } else if (payload.method === 'LIST') {
        // src: 0 — Zepp + Hub, 1 — только Hub, 2 — только Zepp
        const src = (payload.params || {}).src || 0
        const local = src === 1 ? [] : getNotes().map((n) => ({ id: n.id, title: n.title, len: String(n.text || '').length }))
        if (src === 2) return ctx.response({ data: { result: { items: local, hub: null } } })
        hubCall('HUB_NOTES', {}).then((hub) => {
          const have = {}
          local.forEach((n) => (have[n.id] = 1))
          const fromHub = hub && hub.ok ? hub.items.filter((n) => !have[n.id]) : []
          ctx.response({ data: { result: { items: fromHub.concat(local), hub: !!(hub && hub.ok), err: hub && hub.err } } })
        })
      } else if (payload.method === 'GET') {
        const id = (payload.params || {}).id
        const src = (payload.params || {}).src || 0
        const note = src === 1 ? null : getNotes().find((n) => n.id === id)
        if (note || src === 2) return ctx.response({ data: { result: note ? pack(note) : null } })
        hubCall('HUB_NOTE', { id }).then((r) => ctx.response({ data: { result: r && r.ok ? pack(r.note) : null } }))
      } else {
        ctx.response({ data: { result: null } })
      }
    })
  },
  onRun() {},
  onDestroy() {}
})
