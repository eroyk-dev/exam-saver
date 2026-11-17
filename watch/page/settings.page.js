import { getCfg, setCfg } from '../utils/store'
import { W, H, M, TOP_PAD, BOT_PAD, C, button, text, rect, remove } from '../utils/ui'

const MIN_FONT = 14
const MAX_FONT = 40
const STEP = 2

const TITLE_Y = TOP_PAD + 4
const CTRL_H = 48
const CTRL_Y = H - BOT_PAD - CTRL_H
const CARD_Y = TITLE_Y + 34
const BTN_H = 36
const B3_Y = CTRL_Y - 6 - BTN_H
const B2_Y = B3_Y - 4 - BTN_H
const B1_Y = B2_Y - 4 - BTN_H
const CARD_H = B1_Y - 8 - CARD_Y

Page({
  state: { font: 22, preview: null, value: null },

  build() {
    const s = this.state
    s.font = getCfg().font

    text({
      x: M,
      y: TITLE_Y,
      w: W - 2 * M,
      h: 28,
      text: 'Размер шрифта',
      text_size: 18,
      color: C.dim
    })

    // Карточка с примером текста
    rect({ x: M, y: CARD_Y, w: W - 2 * M, h: CARD_H, radius: 18, color: C.card })

    const change = (d) => {
      const f = Math.min(MAX_FONT, Math.max(MIN_FONT, s.font + d))
      if (f === s.font) return
      s.font = f
      setCfg({ font: f })
      this.redraw()
    }
    button({
      x: M,
      y: CTRL_Y,
      w: 58,
      h: CTRL_H,
      text: '−',
      text_size: 30,
      radius: CTRL_H / 2,
      click_func: () => change(-STEP)
    })
    button({
      x: W - M - 58,
      y: CTRL_Y,
      w: 58,
      h: CTRL_H,
      text: '+',
      text_size: 30,
      radius: CTRL_H / 2,
      click_func: () => change(STEP)
    })
    const modeBtn = button({
      x: M, y: B1_Y, w: W - 2 * M, h: BTN_H, text_size: 15, radius: 20,
      text: getCfg().color ? 'Фото: цветные' : 'Фото: серые (меньше)',
      click_func: () => {
        setCfg({ color: getCfg().color ? 0 : 1 })
        modeBtn.setProperty(hmUI.prop.TEXT, getCfg().color ? 'Фото: цветные' : 'Фото: серые (меньше)')
      }
    })
    button({
      x: M, y: B2_Y, w: W - 2 * M, h: BTN_H, text_size: 15, radius: 20, text: 'Проверка показа фото',
      click_func: () => hmApp.gotoPage({ url: 'page/probe.page' })
    })
    const NS = ['Заметки: Zepp + Hub', 'Заметки: только Hub', 'Заметки: только Zepp']
    const srcBtn = button({
      x: M, y: B3_Y, w: W - 2 * M, h: BTN_H, text_size: 15, radius: 20,
      text: NS[getCfg().nsrc || 0],
      click_func: () => {
        const n = ((getCfg().nsrc || 0) + 1) % 3
        setCfg({ nsrc: n })
        srcBtn.setProperty(hmUI.prop.TEXT, NS[n])
      }
    })
    this.redraw()
  },

  redraw() {
    const s = this.state
    if (s.preview) remove(s.preview)
    if (s.value) remove(s.value)
    s.preview = text({
      x: M + 10,
      y: CARD_Y + 8,
      w: W - 2 * M - 20,
      h: CARD_H - 16,
      text: 'Пример текста.\nАбвгд Ёё\n0123456789',
      text_size: s.font,
      align_h: hmUI.align.LEFT,
      align_v: hmUI.align.TOP
    })
    s.value = text({
      x: M + 58,
      y: CTRL_Y,
      w: W - 2 * M - 116,
      h: CTRL_H,
      text: String(s.font),
      text_size: 26,
      color: C.green
    })
  }
})
