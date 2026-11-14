import { getNote, getCfg } from '../utils/store'
import { W, H, M, TOP_PAD, BOT_PAD, C, button, text, remove } from '../utils/ui'

// Текст начинается ниже системной строки и скруглённых углов; снизу — панель листания
const FOOT_H = 34
const FOOT_Y = H - BOT_PAD - FOOT_H
const TEXT_TOP = TOP_PAD + 14
const AREA = { x: M + 2, y: TEXT_TOP, w: W - 2 * (M + 2), h: FOOT_Y - TEXT_TOP - 8 }

Page({
  state: {
    p: {},
    text: '',
    font: 22,
    starts: [0], // смещения начала страниц (считаются лениво)
    idx: 0,
    total: 0, // известно, когда дошли до конца
    textW: null,
    label: null,
    prev: null,
    next: null
  },

  onInit(param) {
    try {
      this.state.p = JSON.parse(param)
    } catch (e) {
      this.state.p = {}
    }
  },

  build() {
    const s = this.state
    s.font = getCfg().font
    const t = getNote(s.p.id)
    if (t) {
      s.text = t
      this.drawPage()
    } else {
      this.showMessage('Файл не найден')
    }
  },

  onDestroy() {
    this.state.text = ''
  },

  showMessage(msg) {
    this.clearAll()
    this.state.textW = text({
      x: M + 6,
      y: TEXT_TOP + 20,
      w: W - 2 * M - 12,
      h: H - 2 * (TEXT_TOP + 20),
      text: msg,
      text_size: 20,
      color: C.dim
    })
  },

  clearAll() {
    const s = this.state
    ;['textW', 'label', 'prev', 'next'].forEach((k) => {
      if (s[k]) {
        remove(s[k])
        s[k] = null
      }
    })
  },

  // Где заканчивается страница, начинающаяся с позиции start
  pageEnd(start) {
    const s = this.state
    const t = s.text
    const n = t.length
    const rem = n - start
    if (rem <= 0) return n
    const size = s.font
    const maxGuess = Math.floor(AREA.w / (size * 0.35)) * Math.floor(AREA.h / (size * 1.1)) + 10
    let lo = 1
    let hi = Math.min(rem, maxGuess)

    if (typeof hmUI.getTextLayout === 'function') {
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1
        const lay = hmUI.getTextLayout(t.substr(start, mid), {
          text_size: size,
          text_width: AREA.w,
          wrapped: 1
        })
        if (lay && lay.height <= AREA.h) lo = mid
        else hi = mid - 1
      }
    } else {
      lo = Math.min(rem, Math.floor(maxGuess * 0.6))
    }

    let end = start + lo
    if (end < n) {
      // По возможности не рвём слово
      const seg = t.substring(start, end)
      const cut = Math.max(seg.lastIndexOf(' '), seg.lastIndexOf('\n'))
      if (cut > lo * 0.7) end = start + cut + 1
    }
    return end
  },

  drawPage() {
    const s = this.state
    this.clearAll()
    const start = s.starts[s.idx]
    const end = this.pageEnd(start)
    const last = end >= s.text.length
    if (last) s.total = s.idx + 1
    if (!last && s.starts.length === s.idx + 1) s.starts.push(end)

    s.textW = text({
      x: AREA.x,
      y: AREA.y,
      w: AREA.w,
      h: AREA.h,
      text: s.text.substring(start, end),
      text_size: s.font,
      align_h: hmUI.align.LEFT,
      align_v: hmUI.align.TOP
    })

    s.prev = button({
      x: M,
      y: FOOT_Y,
      w: 54,
      h: FOOT_H,
      text: '<',
      text_size: 22,
      color: s.idx > 0 ? C.text : 0x48484a,
      radius: FOOT_H / 2,
      click_func: () => {
        if (s.idx > 0) {
          s.idx--
          this.drawPage()
        }
      }
    })
    s.label = text({
      x: M + 54,
      y: FOOT_Y,
      w: W - 2 * M - 108,
      h: FOOT_H,
      text: s.idx + 1 + (s.total ? ' / ' + s.total : ''),
      text_size: 16,
      color: C.dim
    })
    s.next = button({
      x: W - M - 54,
      y: FOOT_Y,
      w: 54,
      h: FOOT_H,
      text: '>',
      text_size: 22,
      color: last ? 0x48484a : C.text,
      radius: FOOT_H / 2,
      click_func: () => {
        if (!last) {
          s.idx++
          this.drawPage()
        }
      }
    })
  }
})
