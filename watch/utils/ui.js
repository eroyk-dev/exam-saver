// Общая тема и безопасные зоны. Экран браслета со скруглёнными углами (~25 px):
// всё важное держим внутри полей, иначе углы обрезают текст и кнопки.
export const { width: W, height: H } = hmSetting.getDeviceInfo()

export const M = 12 // боковое поле
export const TOP_PAD = 34 // отступ сверху: системная строка с названием и временем + скруглённые углы
export const BOT_PAD = 16 // отступ снизу (углы)

export const C = {
  bg: 0x000000,
  card: 0x1c1c1e,
  press: 0x2c2c2e,
  text: 0xffffff,
  dim: 0x8e8e93,
  green: 0x30d158,
  greenBg: 0x0c2e17,
  amber: 0xffd60a,
  amberBg: 0x342b00,
  red: 0xff453a,
  redBg: 0x3a1210,
  blue: 0x0a84ff,
  blueBg: 0x0b2a4a,
  grey: 0x8e8e93,
  greyBg: 0x1c1c1e
}

export function button(props) {
  return hmUI.createWidget(
    hmUI.widget.BUTTON,
    Object.assign(
      {
        text_size: 18,
        color: C.text,
        normal_color: C.card,
        press_color: C.press,
        radius: 16
      },
      props
    )
  )
}

export function text(props) {
  return hmUI.createWidget(
    hmUI.widget.TEXT,
    Object.assign(
      {
        text_size: 18,
        color: C.text,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
        text_style: hmUI.text_style.WRAP
      },
      props
    )
  )
}

export function rect(props) {
  return hmUI.createWidget(hmUI.widget.FILL_RECT, Object.assign({ color: C.card, radius: 16 }, props))
}

export function remove(w) {
  try {
    hmUI.deleteWidget(w)
  } catch (e) {}
}

// Большая иконочная кнопка (картинки assets/<target>/ic_<name>.png и ic_<name>_p.png, 52x52)
export const ICON = 52

export function iconButton(x, y, name, click) {
  return hmUI.createWidget(hmUI.widget.BUTTON, {
    x,
    y,
    w: ICON,
    h: ICON,
    text: '',
    normal_src: 'ic_' + name + '.png',
    press_src: 'ic_' + name + '_p.png',
    click_func: click
  })
}
