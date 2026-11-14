import { getCfg, setCfg } from '../utils/store'
import { writeTestImage } from '../utils/imgstore'
import { W, H, M, TOP_PAD, BOT_PAD, C, button, text, rect, remove } from '../utils/ui'

const MIN_FONT = 14
const MAX_FONT = 40
const STEP = 2

const TITLE_Y = TOP_PAD + 4
const CTRL_H = 48
const CTRL_Y = H - BOT_PAD - CTRL_H
const CARD_Y = TITLE_Y + 34
const BTN_H = 40
const B2_Y = CTRL_Y - 8 - BTN_H
const B1_Y = B2_Y - 6 - BTN_H
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
      click_func: () => {
        try {
          writeTestImage()
        } catch (e) {}
        hmApp.gotoPage({ url: 'page/viewer.page', param: JSON.stringify({ id: 'test', n: 1 }) })
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
