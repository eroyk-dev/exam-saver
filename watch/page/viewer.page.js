import { getCfg, setCfg } from '../utils/store'
import { PATHS, tileFile, srcFor } from '../utils/imgstore'
import { W, H, C, text, remove } from '../utils/ui'

// Полноэкранный просмотр. Плитки (длинные картинки): тап справа/слева — следующая/предыдущая.
// Левый верхний угол (невидимая зона): сменить способ пути к файлу — для проверки показа.
Page({
  state: { id: '', n: 1, t: 0, img: null, info: null },

  onInit(param) {
    let p = {}
    try {
      p = JSON.parse(param || '{}')
    } catch (e) {}
    this.state.id = p.id || 'test'
    this.state.n = p.n || 1
  },

  build() {
    this.show()
  },

  show() {
    const s = this.state
    ;[s.img, s.info, s.hit, s.hitL, s.hitR].forEach((w) => w && remove(w))
    const file = tileFile(s.id, s.t)
    const st = getCfg().ip || 0
    s.img = hmUI.createWidget(hmUI.widget.IMG, { x: 0, y: 0, src: srcFor(file, st) })
    const label = (s.n > 1 ? s.t + 1 + '/' + s.n + '  ' : '') + 'путь ' + ((st % PATHS.length) + 1)
    s.info = label
      ? text({ x: 0, y: H - 24, w: W, h: 22, text: label, text_size: 14, color: C.amber, text_style: hmUI.text_style.NONE })
      : null
    const zone = (x, w, f) =>
      hmUI.createWidget(hmUI.widget.BUTTON, {
        x,
        y: 0,
        w,
        h: H,
        text: '',
        normal_color: 0,
        press_color: 0,
        alpha: 0,
        click_func: f
      })
    if (s.n > 1) {
      s.hitL = zone(0, W / 2, () => this.go(-1))
      s.hitR = zone(W / 2, W / 2, () => this.go(1))
    }
    s.hit = hmUI.createWidget(hmUI.widget.BUTTON, {
      x: 0,
      y: 0,
      w: 48,
      h: 48,
      text: '',
      normal_color: 0,
      press_color: 0,
      click_func: () => {
        setCfg({ ip: ((getCfg().ip || 0) + 1) % PATHS.length })
        this.show()
      }
    })
  },

  go(d) {
    const s = this.state
    s.t = (s.t + d + s.n) % s.n
    this.show()
  }
})
