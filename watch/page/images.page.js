import { request } from '../utils/link'
import { b64decode } from '../utils/b64'
import { getCfg } from '../utils/store'
import { loadImgs, deleteImg, commitImg, openTile, appendTile, closeTile, tileSize, MAX_IMGS } from '../utils/imgstore'
import { W, H, M, TOP_PAD, BOT_PAD, C, ICON, button, text, rect, remove, iconButton } from '../utils/ui'

const CAP_Y = TOP_PAD + ICON + 4
const CAP_H = 22
const LIST_Y = CAP_Y + CAP_H + 4
const ROW = 50
const GAP = 6
const FOOT_Y = H - BOT_PAD - ICON
const PER = Math.max(1, Math.floor((FOOT_Y - 6 - LIST_Y) / (ROW + GAP)))
const COL_GAP = (W - 2 * M - 3 * ICON) / 2
const X0 = M
const X1 = M + ICON + COL_GAP
const X2 = W - M - ICON
const CHUNK = 8000

Page({
  state: { items: [], page: 0, del: false, busy: false, cap: { t: '', c: C.dim }, widgets: [], capW: null },

  onInit() {
    this.state.items = loadImgs()
    this.state.cap = { t: 'Фото: ' + this.state.items.length, c: C.dim }
  },

  build() {
    this.render()
  },

  setCap(t, c) {
    this.state.cap = { t, c }
    this.drawCap()
  },

  drawCap() {
    const s = this.state
    if (s.capW) remove(s.capW)
    s.capW = text({
      x: 6,
      y: CAP_Y,
      w: W - 12,
      h: CAP_H,
      text: s.cap.t,
      text_size: s.cap.t.length > 18 ? 12 : 14,
      color: s.cap.c,
      text_style: hmUI.text_style.NONE
    })
  },

  // Одна картинка: meta → плитки по кускам base64 → запись в файлы → индекс
  loadOne(it, mode, label) {
    const q = { id: it.id, w: W, h: H, mode }
    return request('IMG_META', q, 20000).then((res) => {
      const m = res && res.result
      if (!m || !m.ok) throw new Error((m && m.err) || 'нет ответа')
      const step = (t) => {
        if (t >= m.tiles) {
          commitImg({ id: it.id, title: m.title || it.title, n: m.tiles, mode, w: W })
          return
        }
        const h = openTile(it.id, t)
        const part = (off) =>
          request('IMG_CHUNK', Object.assign({ tile: t, off, len: CHUNK }, q), 20000).then((r) => {
            const c = r && r.result
            if (!c || !c.ok) {
              closeTile(h)
              throw new Error((c && c.err) || 'обрыв')
            }
            appendTile(h, b64decode(c.b64))
            const pct = Math.min(99, Math.round((h.pos / m.sizes[t]) * 100))
            this.setCap(label + (m.tiles > 1 ? ' [' + (t + 1) + '/' + m.tiles + ']' : '') + ' ' + pct + '%', C.dim)
            if (c.done) {
              closeTile(h)
              if (tileSize(it.id, t) !== m.sizes[t]) throw new Error('размер не сошёлся')
              return
            }
            return part(off + CHUNK)
          })
        return part(0).then(() => step(t + 1))
      }
      return step(0)
    })
  },

  sync() {
    const s = this.state
    if (s.busy) return
    s.busy = true
    s.del = false
    const mode = getCfg().color ? 'color' : 'gray'
    this.setCap('Список с сервера…', C.dim)
    request('IMG_LIST', {}, 20000)
      .then((res) => {
        const r = res && res.result
        if (!r || !r.ok) throw new Error((r && r.err) || 'мост не отвечает')
        const have = {}
        loadImgs().forEach((x) => {
          if (x.mode === mode && x.w === W) have[x.id] = 1
        })
        const todo = r.items.slice(0, MAX_IMGS).filter((x) => !have[x.id])
        if (!todo.length) return this.setCap('Новых фото нет', C.amber)
        let ok = 0
        let fail = ''
        return todo
          .reduce(
            (p, it, i) =>
              p.then(() =>
                this.loadOne(it, mode, i + 1 + '/' + todo.length)
                  .then(() => {
                    ok++
                  })
                  .catch((e) => {
                    fail = String((e && e.message) || e).slice(0, 40)
                  })
              ),
            Promise.resolve()
          )
          .then(() => this.setCap(fail && !ok ? fail : 'Готово: ' + ok + ' из ' + todo.length, ok ? C.green : C.red))
      })
      .catch((e) => {
        const m = String((e && e.message) || '')
        this.setCap(!m || /time|Timed/i.test(m) ? 'Нет связи с Zepp на телефоне' : m.slice(0, 40), C.red)
      })
      .then(() => {
        s.busy = false
        s.items = loadImgs()
        this.render()
      })
  },

  clear() {
    this.state.widgets.forEach(remove)
    this.state.widgets = []
  },

  render() {
    this.clear()
    const s = this.state
    const keep = (w) => {
      s.widgets.push(w)
      return w
    }
    keep(iconButton(X1, TOP_PAD, 'sync', () => this.sync()))
    keep(iconButton(X0, TOP_PAD, 'prev', () => hmApp.goBack()))
    this.drawCap()

    if (!s.items.length) {
      keep(
        text({
          x: M + 6,
          y: LIST_Y,
          w: W - 2 * M - 12,
          h: FOOT_Y - LIST_Y - 10,
          text: 'Нет фото.\nЗапустите мост и нажмите синхронизацию',
          text_size: 18,
          color: C.dim
        })
      )
      return
    }
    const pages = Math.ceil(s.items.length / PER)
    if (s.page >= pages) s.page = pages - 1
    s.items.slice(s.page * PER, s.page * PER + PER).forEach((it, i) => {
      const y = LIST_Y + i * (ROW + GAP)
      const title = String(it.title || 'Без названия')
      keep(
        button({
          x: M,
          y,
          w: W - 2 * M,
          h: ROW,
          text: title.length > 15 ? title.slice(0, 14) + '…' : title,
          text_size: 18,
          normal_color: s.del ? C.redBg : C.card,
          click_func: () => {
            if (s.del) {
              deleteImg(it.id)
              s.items = loadImgs()
              this.setCap('Фото: ' + s.items.length, C.dim)
              this.render()
            } else {
              hmApp.gotoPage({ url: 'page/viewer.page', param: JSON.stringify({ id: it.id, n: it.n }) })
            }
          }
        })
      )
      keep(rect({ x: M + 8, y: y + 14, w: 4, h: ROW - 28, radius: 2, color: s.del ? C.red : C.blue }))
    })
    if (pages > 1) {
      keep(iconButton(X0, FOOT_Y, 'prev', () => ((s.page = (s.page + pages - 1) % pages), this.render())))
      keep(iconButton(X2, FOOT_Y, 'next', () => ((s.page = (s.page + 1) % pages), this.render())))
    }
    keep(
      iconButton(X1, FOOT_Y, s.del ? 'done' : 'del', () => {
        s.del = !s.del
        this.setCap(s.del ? 'Тап по фото — удалить' : 'Фото: ' + s.items.length, s.del ? C.red : C.dim)
        this.render()
      })
    )
  }
})
