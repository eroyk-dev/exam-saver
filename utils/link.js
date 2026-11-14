export function gdata() {
  return getApp()._options.globalData
}

// Есть ли Bluetooth-связь с телефоном (если API недоступно — считаем, что есть,
// дальше решит таймаут запроса)
export function bleConnected() {
  try {
    if (typeof hmBle !== 'undefined' && typeof hmBle.connectStatus === 'function') {
      return !!hmBle.connectStatus()
    }
  } catch (e) {}
  return true
}

// Запрос к сервису на телефоне (app-side). Таймаут короткий, чтобы быстро уйти в оффлайн.
export function request(method, params, timeout) {
  return gdata().messageBuilder.request(
    { method, params: params || {} },
    { timeout: timeout || 5000 }
  )
}

export function toast(text) {
  try {
    hmUI.showToast({ text })
  } catch (e) {}
}
