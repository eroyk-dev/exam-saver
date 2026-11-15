import { loadImgs } from '../utils/imgstore'
import { loadIndex, deleteNote, saveNote, MAX_NOTES } from '../utils/store'
import { gdata, bleConnected, request } from '../utils/link'
import { W, H, M, TOP_PAD, BOT_PAD, C, ICON, button, text, rect, remove, iconButton } from '../utils/ui'

// Вёрстка (внутри безопасных полей: системная строка сверху, скруглённые углы)
const CAP_Y = TOP_PAD + ICON + 4
const CAP_H = 22
const LIST_Y = CAP_Y + CAP_H + 4
const ROW = 50
const GAP = 6
const FOOT_Y = H - BOT_PAD - ICON
const PER = Math.max(1, Math.floor((FOOT_Y - 6 - LIST_Y) / (ROW + GAP)) - 1) // минус закреплённая строка «Фото»
const LIST0 = LIST_Y + ROW + GAP

// Три колонки одинаковой ширины: x0 — слева, x1 — по центру, x2 — справа
const COL_GAP = (W - 2 * M - 3 * ICON) / 2
const X0 = M
const X1 = M + ICON + COL_GAP
const X2 = W - M - ICON

const LINK_ICON = { probe: 'probe', on: 'online', off: 'offline' }

Page({
  state: {
    link: 'probe', // probe | on | off — есть ли связь с телефоном
    items: [],
    page: 0,
    del: false,
    busy: false,
    cap: { t: '', c: C.dim },
    widgets: [],
    capW: null
  },

  onInit() {
    const s = this.state
    s.items = loadIndex()
    s.cap = { t: 'Файлов: ' + s.items.length, c: C.dim }
    // Файл прилетел с телефона (кнопка «Передать на часы») — обновляем список
    gdata().onSaved = () => {
      s.items = loadIndex()
      this.setCap('Получен файл', C.green)
      this.render()
    }
  },

  build() {
    this.render()
    this.checkLink()
  },

  onDestroy() {
    gdata().onSaved = null
  },

  // Индикатор «в сети / не в сети»
  checkLink() {
    const s = this.state
    if (s.busy) return
    s.link = 'probe'
    this.render()
    if (!bleConnected()) {
      s.link = 'off'
      this.render()
      return
    }
    request('LIST', {}, 3000)
      .then(() => {
        s.link = 'on'
        this.render()
      })
      .catch(() => {
        s.link = 'off'
        this.render()
      })
  },

  // Синхронизация: забрать с телефона все шпаргалки и сохранить в память часов
  sync() {
    const s = this.state
    if (s.busy) return
    s.busy = true
    s.del = false
    this.setCap('Синхронизация…', C.dim)

    request('LIST', {}, 5000)
      .then((res) => {
        s.link = 'on'
        const list = ((res && res.result) || []).slice(0, MAX_NOTES)
        if (!list.length) {
          s.busy = false
          this.setCap('Телефон: нет файлов', C.amber)
          this.render()
          return
        }
        let ok = 0
        // от старых к новым, чтобы порядок на часах совпал с телефоном
        return list
          .slice()
          .reverse()
          .reduce(
            (p, it, i) =>
              p.then(() => {
                this.setCap('Загрузка ' + (i + 1) + ' из ' + list.length, C.dim)
                return request('GET', { id: it.id }, 8000)
                  .then((r) => {
                    if (r && r.result && r.result.text && saveNote(r.result)) ok++
                  })
                  .catch(() => {})
              }),
            Promise.resolve()
          )
          .then(() => {
            s.busy = false
            s.items = loadIndex()
            this.setCap('Готово: ' + ok + ' из ' + list.length, ok ? C.green : C.red)
            this.render()
          })
      })
      .catch(() => {
        s.busy = false
        s.link = 'off'
        this.setCap('Ошибка: нет связи', C.red)
        this.render()
      })
  },

  open(it) {
    hmApp.gotoPage({
      url: 'page/reader.page',
      param: JSON.stringify({ id: it.id, title: it.title })
    })
  },

  // Строка состояния под шапкой — всегда видимая обратная связь
  setCap(t, c) {
    this.state.cap = { t, c }
    this.drawCap()
  },

  drawCap() {
    const s = this.state
    if (s.capW) remove(s.capW)
    // Строка в одну линию: шире поля (здесь нет углов) и мельче шрифт для длинных фраз
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

    // ── Шапка: статус связи (тап = перепроверить), синхронизация, настройки
    keep(iconButton(X0, TOP_PAD, LINK_ICON[s.link], () => this.checkLink()))
    keep(iconButton(X1, TOP_PAD, 'sync', () => this.sync()))
    keep(iconButton(X2, TOP_PAD, 'menu', () => hmApp.gotoPage({ url: 'page/settings.page' })))
    this.drawCap()

    // ── Закреплённая строка: галерея
    keep(
      button({
        x: M,
        y: LIST_Y,
        w: W - 2 * M,
        h: ROW,
        text: 'Фото · ' + loadImgs().length,
        text_size: 18,
        normal_color: C.blueBg,
        click_func: () => hmApp.gotoPage({ url: 'page/images.page' })
      })
    )

    // ── Пустой список
    if (!s.items.length) {
      keep(
        text({
          x: M + 6,
          y: LIST0,
          w: W - 2 * M - 12,
          h: FOOT_Y - LIST0 - 10,
          text: 'Нет сохранённых файлов.\nНажмите кнопку синхронизации',
          text_size: 18,
          color: C.dim
        })
      )
      return
    }

    // ── Список файлов
    const pages = Math.ceil(s.items.length / PER)
    if (s.page >= pages) s.page = pages - 1
    const slice = s.items.slice(s.page * PER, s.page * PER + PER)
    const accent = s.del ? C.red : C.blue

    slice.forEach((it, i) => {
      const y = LIST0 + i * (ROW + GAP)
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
              deleteNote(it.id)
              s.items = loadIndex()
              this.setCap('Файлов: ' + s.items.length, C.dim)
              this.render()
            } else {
              this.open(it)
            }
          }
        })
      )
      keep(rect({ x: M + 8, y: y + 14, w: 4, h: ROW - 28, radius: 2, color: accent }))
    })

    // ── Нижняя панель: листание и режим удаления
    if (pages > 1) {
      keep(
        iconButton(X0, FOOT_Y, 'prev', () => {
          s.page = (s.page + pages - 1) % pages
          this.render()
        })
      )
      keep(
        iconButton(X2, FOOT_Y, 'next', () => {
          s.page = (s.page + 1) % pages
          this.render()
        })
      )
    }
    keep(
      iconButton(X1, FOOT_Y, s.del ? 'done' : 'del', () => {
        s.del = !s.del
        this.setCap(s.del ? 'Тап по файлу — удалить' : 'Файлов: ' + s.items.length, s.del ? C.red : C.dim)
        this.render()
      })
    )
  }
})
