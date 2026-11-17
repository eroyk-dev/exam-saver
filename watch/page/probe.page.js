import { getCfg, setCfg } from '../utils/store'
import { PATHS, tileFile, writeTestImage, copyAssetProbe, tileSize } from '../utils/imgstore'
import { W, H, TOP_PAD, C, text } from '../utils/ui'

// Все способы пути видны сразу: колонка A — копия значка из ресурсов (формат заведомо верный),
// колонка B — градиент нашего формата. Тап по строке — выбрать этот способ для просмотра фото.
const ROW = 52
const Y0 = TOP_PAD + 30

Page({
  build() {
    let a = ''
    let b = ''
    try {
      writeTestImage()
      b = tileSize('test', 0) + ' Б'
    } catch (e) {
      b = 'ошибка записи'
    }
    a = copyAssetProbe('ic_sync.png')
    text({
      x: 4,
      y: TOP_PAD - 4,
      w: W - 8,
      h: 32,
      text: 'A копия ' + a + ' · B тест ' + b,
      text_size: 12,
      color: C.amber,
      text_style: hmUI.text_style.NONE
    })
    const cur = getCfg().ip || 0
    PATHS.forEach((mk, i) => {
      const y = Y0 + i * ROW
      const mark = text({
        x: 2,
        y,
        w: 30,
        h: ROW,
        text: String(i + 1),
        text_size: 22,
        color: i === cur ? C.green : C.dim
      })
      try {
        hmUI.createWidget(hmUI.widget.IMG, { x: 36, y, src: mk(tileFile('probe', 0)) })
      } catch (e) {}
      try {
        hmUI.createWidget(hmUI.widget.IMG, { x: 100, y, src: mk(tileFile('test', 0)) })
      } catch (e) {}
      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: 0,
        y,
        w: 34,
        h: ROW,
        text: '',
        normal_color: 0,
        press_color: C.press,
        alpha: 0,
        click_func: () => {
          setCfg({ ip: i })
          hmUI.showToast({ text: 'Выбран путь ' + (i + 1) })
        }
      })
    })
  }
})
