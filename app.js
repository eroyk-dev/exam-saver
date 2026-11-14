import './shared/device-polyfill'
import { MessageBuilder } from './shared/message'
import { saveNote } from './utils/store'

App({
  globalData: {
    messageBuilder: null,
    mode: null, // 'online' | 'offline' | null (ещё не определён)
    items: [], // кэш списка с телефона для онлайн-режима
    onSaved: null // колбэк страницы списка, когда файл сохранён
  },
  onCreate() {
    const appId = hmApp.packageInfo().appId
    const mb = new MessageBuilder({ appId })
    this.globalData.messageBuilder = mb
    mb.connect()

    const gd = this.globalData
    // Телефон прислал файл для сохранения в память часов (оффлайн-режим)
    mb.on('call', ({ payload: buf }) => {
      try {
        const data = mb.buf2Json(buf)
        if (data && data.type === 'SAVE' && data.note) {
          saveNote(data.note)
          try {
            hmUI.showToast({ text: 'Сохранено: ' + String(data.note.title || '').slice(0, 20) })
          } catch (e) {}
          if (typeof gd.onSaved === 'function') gd.onSaved()
        }
      } catch (e) {}
    })
  },
  onDestroy() {
    this.globalData.messageBuilder.disConnect()
  }
})
