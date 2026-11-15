package com.examesaver.hub

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val LightFallback = lightColorScheme(primary = Color(0xFF3B5BA9), secondary = Color(0xFF575E71), tertiary = Color(0xFF725572))
private val DarkFallback = darkColorScheme(primary = Color(0xFFB4C5FF), secondary = Color(0xFFBFC6DC), tertiary = Color(0xFFE1BBDD))

/** mode: 0 — как в системе, 1 — светлая, 2 — тёмная. Динамические цвета (Material You) — Android 12+. */
@Composable
fun HubTheme(mode: Int, dynamic: Boolean, content: @Composable () -> Unit) {
    val dark = when (mode) { 1 -> false; 2 -> true; else -> isSystemInDarkTheme() }
    val ctx = LocalContext.current
    val scheme = when {
        dynamic && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(ctx) else dynamicLightColorScheme(ctx)
        dark -> DarkFallback
        else -> LightFallback
    }
    MaterialTheme(colorScheme = scheme, content = content)
}
