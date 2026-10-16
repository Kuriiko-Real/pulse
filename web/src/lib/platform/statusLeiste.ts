import { Keyboard, KeyboardStyle } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { isCapacitorIOS } from './runtime';

/**
 * Native Leisten folgen dem App-Erscheinungsbild.
 *
 * Seit dem Full-Bleed-Umbau malt die Seite unter die Statusleiste — ohne
 * diesen Aufruf stünde dort im dunklen Erscheinungsbild dunkle Uhr/Statustext
 * auf dunklem Glas. Dasselbe gilt für den Tastatur-Anhang (Keyboard-Style).
 *
 * Nur in der iOS-Hülle; in Browser, Electron und der Android-Hülle ein
 * No-op.
 *
 * Aufgerufen aus dem App-Shell als $effect über den mode-watcher-Modus; es
 * feuert damit auch beim Systemwechsel unter theme=auto.
 */
export function statusLeisteFolgtTheme(dunkel: boolean): void {
  // Nur iOS: die Android-Hülle steuert ihre Systemleisten selbst
  // (`MainActivity.wendeLeistenAn`), ein zweiter Setzer aus der Web-App käme
  // dazu (Eigentümer-Grundsatz 2026-10-16 — Android wie vor der iOS-Arbeit).
  if (!isCapacitorIOS()) return;
  void StatusBar.setStyle({ style: dunkel ? Style.Dark : Style.Light }).catch(() => undefined);
  void Keyboard.setStyle({
    style: dunkel ? KeyboardStyle.Dark : KeyboardStyle.Light
  }).catch(() => undefined);
}
