package com.examesaver.hub

import android.Manifest
import android.content.Intent
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        Native.init(filesDir.absolutePath + "/hub")
        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        val ui = getSharedPreferences("ui", MODE_PRIVATE)
        setContent {
            var dynamic by remember { mutableStateOf(ui.getBoolean("dynamic", true)) }
            var mode by remember { mutableIntStateOf(ui.getInt("mode", 0)) }
            HubTheme(mode, dynamic) {
                Root(
                    dynamic, mode,
                    onDynamic = { dynamic = it; ui.edit().putBoolean("dynamic", it).apply() },
                    onMode = { mode = it; ui.edit().putInt("mode", it).apply() }
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun Root(dynamic: Boolean, mode: Int, onDynamic: (Boolean) -> Unit, onMode: (Int) -> Unit) {
    var tab by remember { mutableIntStateOf(0) }
    val titles = listOf("Мост", "Заметки", "Фото", "Настройки")
    val icons = listOf(Icons.Filled.Sync, Icons.Filled.Edit, Icons.Filled.Image, Icons.Filled.Settings)
    Scaffold(
        topBar = { LargeTopAppBar(title = { Text(titles[tab]) }) },
        bottomBar = {
            NavigationBar {
                titles.forEachIndexed { i, t ->
                    NavigationBarItem(selected = tab == i, onClick = { tab = i }, icon = { Icon(icons[i], null) }, label = { Text(t) })
                }
            }
        }
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            when (tab) {
                0 -> BridgeScreen()
                1 -> NotesScreen()
                2 -> PhotosScreen()
                else -> SettingsScreen(dynamic, mode, onDynamic, onMode)
            }
        }
    }
}

// ───────────── Мост ─────────────

@Composable
fun BridgeScreen() {
    val ctx = LocalContext.current
    var st by remember { mutableStateOf(JSONObject(Native.status())) }
    LaunchedEffect(Unit) {
        while (true) {
            st = JSONObject(Native.status())
            delay(1500)
        }
    }
    val running = st.optBoolean("running")
    val cfg = remember(running) { JSONObject(Native.getConfig()) }
    val port = cfg.optInt("port", 8765)
    Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        ElevatedCard(Modifier.fillMaxWidth()) {
            ListItem(
                headlineContent = { Text(if (running) "Мост работает" else "Мост остановлен") },
                supportingContent = { Text(if (running) "http://127.0.0.1:$port · запросов: ${st.optInt("hits")}" else "Включите, чтобы часы могли получать фото и заметки") },
                trailingContent = {
                    Switch(running, { on -> if (on) HubService.start(ctx) else HubService.stop(ctx) })
                }
            )
        }
        Card(Modifier.fillMaxWidth()) {
            Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text("Подключение часов", style = MaterialTheme.typography.titleMedium)
                Text("1. В приложении Zepp откройте ExameSaver → настройки.\n2. Адрес моста: http://127.0.0.1:$port" +
                    (if (cfg.optString("token").isNotEmpty()) "\n3. Токен: тот же, что в настройках этого приложения." else "") +
                    "\n\nНа часах: «Фото · N» → синхронизация. Заметки из этого приложения тоже загружаются синхронизацией на главном экране.")
            }
        }
        val log = st.optJSONArray("log") ?: JSONArray()
        if (log.length() > 0) {
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp)) {
                    Text("Последние запросы", style = MaterialTheme.typography.titleSmall)
                    for (i in 0 until log.length()) Text(log.getString(i), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

// ───────────── Заметки ─────────────

data class NoteUi(val id: String, val title: String, val text: String)

fun loadNotes(): List<NoteUi> {
    val a = JSONArray(Native.notes())
    return (0 until a.length()).map { val o = a.getJSONObject(it); NoteUi(o.getString("id"), o.getString("title"), o.getString("text")) }
}

@Composable
fun NotesScreen() {
    var notes by remember { mutableStateOf(loadNotes()) }
    var edit by remember { mutableStateOf<NoteUi?>(null) }
    Box(Modifier.fillMaxSize()) {
        if (notes.isEmpty()) {
            Box(Modifier.fillMaxSize(), Alignment.Center) { Text("Пока пусто. Нажмите «+»", color = MaterialTheme.colorScheme.onSurfaceVariant) }
        } else LazyColumn(contentPadding = PaddingValues(16.dp, 16.dp, 16.dp, 96.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(notes, key = { it.id }) { n ->
                ElevatedCard(onClick = { edit = n }, Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(start = 16.dp, top = 8.dp, bottom = 8.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(n.title, style = MaterialTheme.typography.titleMedium)
                            Text("${n.text.length} симв.", color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                        IconButton(onClick = { Native.deleteNote(n.id); notes = loadNotes() }) { Icon(Icons.Filled.Delete, "Удалить") }
                    }
                }
            }
        }
        FloatingActionButton(onClick = { edit = NoteUi("", "", "") }, Modifier.align(Alignment.BottomEnd).padding(16.dp)) {
            Icon(Icons.Filled.Add, "Добавить")
        }
    }
    edit?.let { n ->
        var title by remember(n) { mutableStateOf(n.title) }
        var text by remember(n) { mutableStateOf(n.text) }
        AlertDialog(
            onDismissRequest = { edit = null },
            title = { Text(if (n.id.isEmpty()) "Новая заметка" else "Заметка") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(title, { title = it }, label = { Text("Название") }, singleLine = true)
                    OutlinedTextField(text, { text = it.take(20000) }, label = { Text("Текст (до 20 000 символов)") }, minLines = 5, maxLines = 10)
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    if (title.isNotBlank() || text.isNotBlank()) {
                        Native.saveNote(JSONObject().put("id", n.id).put("title", title).put("text", text).toString())
                        notes = loadNotes()
                    }
                    edit = null
                }) { Text("Сохранить") }
            },
            dismissButton = { TextButton(onClick = { edit = null }) { Text("Отмена") } }
        )
    }
}

// ───────────── Фото ─────────────

@Composable
fun PhotosScreen() {
    var items by remember { mutableStateOf<List<Pair<String, String>>>(emptyList()) }
    var msg by remember { mutableStateOf("Загрузка…") }
    var tick by remember { mutableIntStateOf(0) }
    LaunchedEffect(tick) {
        msg = "Загрузка…"
        val r = withContext(Dispatchers.IO) { JSONObject(Native.gallery(tick > 0)) }
        if (r.optBoolean("ok")) {
            val a = r.getJSONArray("items")
            items = (0 until a.length()).map { a.getJSONObject(it).let { o -> o.getString("id") to o.getString("title") } }
            msg = if (items.isEmpty()) "Галерея пуста: укажите адрес или папку в настройках" else ""
        } else msg = r.optString("err", "ошибка")
    }
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(if (msg.isEmpty()) "Фото: ${items.size}" else msg, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant)
            FilledTonalButton(onClick = { tick++ }) { Icon(Icons.Filled.Refresh, null); Spacer(Modifier.width(8.dp)); Text("Обновить") }
        }
        LazyVerticalGrid(GridCells.Fixed(2), contentPadding = PaddingValues(16.dp), horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            items(items, key = { it.first }) { (id, title) ->
                val bmp by produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, id) {
                    value = withContext(Dispatchers.IO) {
                        val b = Native.preview(id)
                        if (b.isEmpty()) null else BitmapFactory.decodeByteArray(b, 0, b.size)?.asImageBitmap()
                    }
                }
                ElevatedCard(Modifier.fillMaxWidth()) {
                    Column {
                        Box(Modifier.fillMaxWidth().height(140.dp), Alignment.Center) {
                            val b = bmp
                            if (b != null) Image(b, title, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                            else CircularProgressIndicator(Modifier.size(24.dp))
                        }
                        Text(title, Modifier.padding(10.dp), maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.labelLarge)
                    }
                }
            }
        }
    }
}

// ───────────── Настройки ─────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(dynamic: Boolean, mode: Int, onDynamic: (Boolean) -> Unit, onMode: (Int) -> Unit) {
    val ctx = LocalContext.current
    val cfg = remember { JSONObject(Native.getConfig()) }
    fun lines(k: String): String = cfg.optJSONArray(k)?.let { a -> (0 until a.length()).joinToString("\n") { a.getString(it) } } ?: ""
    var galleries by remember { mutableStateOf(lines("galleries")) }
    var dirs by remember { mutableStateOf(lines("dirs")) }
    var headers by remember { mutableStateOf(lines("headers")) }
    var token by remember { mutableStateOf(cfg.optString("token")) }
    var port by remember { mutableStateOf(cfg.optInt("port", 8765).toString()) }
    var lan by remember { mutableStateOf(cfg.optBoolean("lan")) }
    var saved by remember { mutableStateOf("") }
    fun arr(s: String) = JSONArray(s.lines().map { it.trim() }.filter { it.isNotEmpty() })

    Column(Modifier.verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Источник фото", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(galleries, { galleries = it }, label = { Text("Адреса галерей (по одному в строке)") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
        OutlinedTextField(dirs, { dirs = it }, label = { Text("Папки на телефоне, например /storage/emulated/0/Pictures") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
        OutlinedTextField(headers, { headers = it }, label = { Text("Заголовки для закрытого сервера (Имя: значение)") }, modifier = Modifier.fillMaxWidth(), minLines = 1)
        if (Build.VERSION.SDK_INT >= 30) {
            OutlinedButton(onClick = {
                if (!Environment.isExternalStorageManager())
                    ctx.startActivity(Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + ctx.packageName)))
            }) { Text(if (Environment.isExternalStorageManager()) "Доступ к файлам выдан" else "Выдать доступ к файлам (для папок)") }
        }
        Text("Мост", style = MaterialTheme.typography.titleMedium)
        OutlinedTextField(port, { port = it.filter(Char::isDigit).take(5) }, label = { Text("Порт") }, singleLine = true)
        OutlinedTextField(token, { token = it }, label = { Text("Токен (необязательно)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        ListItem(
            headlineContent = { Text("Доступ из Wi‑Fi сети") },
            supportingContent = { Text("Выкл: только это устройство (127.0.0.1)") },
            trailingContent = { Switch(lan, { lan = it }) }
        )
        Button(onClick = {
            cfg.put("galleries", arr(galleries)).put("dirs", arr(dirs)).put("headers", arr(headers))
                .put("token", token.trim()).put("port", port.toIntOrNull()?.coerceIn(1024, 65535) ?: 8765).put("lan", lan)
            val e = Native.setConfig(cfg.toString())
            if (e.isEmpty() && JSONObject(Native.status()).optBoolean("running")) Native.start()
            saved = if (e.isEmpty()) "Сохранено" else e
        }) { Text("Сохранить") }
        if (saved.isNotEmpty()) Text(saved, color = MaterialTheme.colorScheme.primary)

        HorizontalDivider()
        Text("Оформление", style = MaterialTheme.typography.titleMedium)
        val can = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
        ListItem(
            headlineContent = { Text("Динамические цвета") },
            supportingContent = { Text(if (can) "Палитра из обоев (Material You)" else "Нужен Android 12 или новее") },
            trailingContent = { Switch(dynamic && can, onDynamic, enabled = can) }
        )
        val labels = listOf("Система", "Светлая", "Тёмная")
        SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
            labels.forEachIndexed { i, l -> SegmentedButton(mode == i, { onMode(i) }, SegmentedButtonDefaults.itemShape(i, labels.size)) { Text(l) } }
        }
    }
}
