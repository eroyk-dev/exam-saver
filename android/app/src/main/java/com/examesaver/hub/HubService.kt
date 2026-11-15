package com.examesaver.hub

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/** Держит мост запущенным в фоне, чтобы приложение Zepp могло забирать фото и заметки. */
class HubService : Service() {
    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Native.stop()
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        Native.init(filesDir.absolutePath + "/hub")
        val err = Native.start()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("hub", "Мост ExameSaver", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val n = Notification.Builder(this, "hub")
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle("Мост ExameSaver")
            .setContentText(if (err.isEmpty()) "Работает для часов" else "Ошибка: $err")
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        else startForeground(1, n)
        return START_STICKY
    }

    companion object {
        const val ACTION_STOP = "stop"
        fun start(c: Context) {
            c.startForegroundService(Intent(c, HubService::class.java))
        }
        fun stop(c: Context) {
            c.startService(Intent(c, HubService::class.java).setAction(ACTION_STOP))
        }
    }
}
