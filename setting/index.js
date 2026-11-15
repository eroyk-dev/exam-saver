const MAX_CHARS = 20000

AppSettingsPage({
  build(props) {
    const st = props.settingsStorage

    let notes = []
    try {
      notes = JSON.parse(st.getItem('notes') || '[]')
    } catch (e) {}
    const saveNotes = (arr) => st.setItem('notes', JSON.stringify(arr))

    const addNote = () => {
      const title = (st.getItem('draftTitle') || '').trim() || 'Без названия'
      const text = String(st.getItem('draftText') || '').slice(0, MAX_CHARS)
      if (!text.trim()) return
      let list = []
      try {
        list = JSON.parse(st.getItem('notes') || '[]')
      } catch (e) {}
      list.unshift({ id: String(Date.now()), title, text })
      saveNotes(list)
      st.setItem('draftTitle', '')
      st.setItem('draftText', '')
    }

    const btn = (label, bg, onClick) =>
      Button({
        label,
        onClick,
        style: {
          fontSize: '12px',
          borderRadius: '30px',
          background: bg,
          color: 'white',
          marginRight: '6px'
        }
      })

    const rows = notes.map((n) =>
      View(
        {
          style: {
            borderBottom: '1px solid #eaeaea',
            padding: '8px 0'
          }
        },
        [
          Text({ paragraph: true, bold: true }, n.title),
          Text({ paragraph: true }, String(n.text || '').length + ' симв.'),
          View({ style: { display: 'flex', flexDirection: 'row' } }, [
            btn('Передать на часы', '#409EFF', () => {
              // timestamp в значении, чтобы повторная отправка тоже срабатывала
              st.setItem('push', JSON.stringify({ id: n.id, t: Date.now() }))
            }),
            btn('Удалить', '#D85E33', () => {
              saveNotes(notes.filter((x) => x.id !== n.id))
            })
          ])
        ]
      )
    )

    return View({ style: { padding: '12px 16px' } }, [
      Text({ paragraph: true, bold: true }, 'ExameSaver — тексты для часов'),
      TextInput({
        label: 'Название',
        value: st.getItem('draftTitle') || '',
        maxLength: 60,
        onChange: (v) => st.setItem('draftTitle', v)
      }),
      TextInput({
        label: 'Текст (вставьте сюда содержимое .txt)',
        value: st.getItem('draftText') || '',
        multiline: true,
        rows: 8,
        maxLength: MAX_CHARS,
        onChange: (v) => st.setItem('draftText', v)
      }),
      btn('Добавить', '#409EFF', addNote),
      Text({ paragraph: true, bold: true }, 'Галерея (мост)'),
      Text({ paragraph: true }, 'Запустите приложение ExameSaver Hub (Android) или tools/gallery_bridge.py. Адрес по умолчанию http://127.0.0.1:8765. Заметки из Hub появятся на часах после синхронизации.'),
      TextInput({
        label: 'Адрес моста',
        value: st.getItem('brUrl') || 'http://127.0.0.1:8765',
        onChange: (v) => st.setItem('brUrl', v)
      }),
      TextInput({
        label: 'Токен (если задан)',
        value: st.getItem('brToken') || '',
        onChange: (v) => st.setItem('brToken', v)
      }),
      View({ style: { marginTop: '12px' } }, rows)
    ])
  }
})
