package com.examesaver.hub

/** Rust-ядро (libhub_core.so): HTTP-мост, конвертация фото, хранилище заметок. Данные — строки JSON. */
object Native {
    init { System.loadLibrary("hub_core") }

    @JvmStatic external fun init(dir: String)
    @JvmStatic external fun start(): String          // "" — успех, иначе текст ошибки
    @JvmStatic external fun stop()
    @JvmStatic external fun status(): String
    @JvmStatic external fun getConfig(): String
    @JvmStatic external fun setConfig(json: String): String
    @JvmStatic external fun notes(): String
    @JvmStatic external fun saveNote(json: String): String
    @JvmStatic external fun deleteNote(id: String)
    @JvmStatic external fun gallery(force: Boolean): String
    @JvmStatic external fun preview(id: String): ByteArray
}
