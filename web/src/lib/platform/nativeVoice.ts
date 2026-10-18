import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isCapacitorAndroid } from './runtime';

/**
 * Bridge zum nativen Voice-Motor der APK (intern/docs/UEBERGABE-MOBILE-VOICE-NATIV.md).
 * Der native Join trägt den Ton im Anrufkanal (USAGE_VOICE_COMMUNICATION) — am
 * eingebauten Lautsprecher folgt er damit dem Anruf-Regler statt dem
 * Medien-Regler — und nimmt das Mikrofon über das SDK auf.
 *
 * **Standardmässig an** auf jeder APK (vom Eigentümer getestet und
 * freigegeben). Notausgang: `localStorage['pulse.nativeVoice'] = '0'`
 * schaltet zurück auf den Web-Weg.
 *
 * Version-Skew (Übergabe §5.3): die WebView lädt das Web remote, die APK rollt
 * langsamer. Deshalb steckt jeder Bridge-Aufruf, der ohne eigenen Raum läuft
 * (Join, Leave, Zustand, Listener, Snapshot, Klang), im try/catch: ein
 * fehlendes oder zu altes Plugin wirft sofort (Capacitor: UNIMPLEMENTED), und
 * der Web-Pfad läuft unverändert weiter. Nur `nativeSetMicEnabled` wirft
 * bewusst weiter (der Aufrufer meldet den Mikrofon-Fehler) — es läuft nur,
 * solange ein nativer Join steht, das Plugin also da ist.
 *
 * Snapshot-Contract (JSON-String vom nativen 'voice'-Event):
 *   { participants?: [{ identity, name, isLocal, isSpeaking, audioLevel,
 *                       micMuted, cameraOn, connectionQuality }],
 *     state?: 'connected' | 'reconnecting' | 'disconnected' }
 */

/** Teilnehmer-Zeile aus dem nativen Snapshot (roh — Aufbereitung macht `androidMotorSnapshot.ts`). */
export type NativeParticipantSnapshot = {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  micMuted: boolean;
  cameraOn: boolean;
  connectionQuality: string;
};

export type NativeVoiceSnapshot = {
  /** Raum-Etikett ('voice' | 'anruf:<id>') — Demux für die zwei Konsumenten. */
  tag?: string;
  participants?: NativeParticipantSnapshot[];
  state?: 'connected' | 'reconnecting' | 'disconnected';
};

interface NativeVoicePlugin {
  /** `joinId` kennzeichnet den Raum dieses Joins (der Web-Store reicht seine
   *  Verbindungs-Generation). APKs vor dem Feld ignorieren es. */
  join(opts: {
    ws_url: string;
    token: string;
    echoCancellation: boolean;
    noiseSuppression: boolean;
    tag: string;
    joinId: number;
  }): Promise<void>;
  /** Mit `joinId`: nur beenden, wenn der laufende Raum zu diesem Join gehört
   *  (ein überholter Join reisst sonst den Raum des neueren ab — die Engine
   *  ist ein Singleton). Ohne: immer beenden (normales Auflegen). APKs vor
   *  dem Feld beenden in beiden Fällen — das Verhalten von vorher. */
  leave(opts?: { joinId?: number }): Promise<void>;
  setMicEnabled(opts: { on: boolean }): Promise<void>;
  setDeafened(opts: { on: boolean }): Promise<void>;
  state(): Promise<{ connected: boolean }>;
  snapshot(): Promise<void>;
  playSound(opts: { id: string }): Promise<void>;
  addListener(
    eventName: 'voice',
    cb: (data: { snapshot: string }) => void
  ): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<NativeVoicePlugin>('Voice');

const FLAG = 'pulse.nativeVoice';

/** Darf der native Weg versucht werden? Auf jeder APK ja, ausser der
 *  Notausgang `pulse.nativeVoice = '0'` ist gesetzt. Ob das Plugin wirklich
 *  da ist, entscheidet erst der Bridge-Aufruf (s. Kopfkommentar). */
export function nativeVoiceErlaubt(): boolean {
  if (!isCapacitorAndroid()) return false;
  try {
    return localStorage.getItem(FLAG) !== '0';
  } catch {
    return true;
  }
}

/** `joinId` des Raums, den die Engine für DIESE Web-Session trägt (`null` =
 *  keiner; nach einem Reload vergessen — dafür `nativeVoiceWaiseAbbauen`). */
let aktiveJoinId: number | null = null;
/** Der zuletzt BEGONNENE Join. Ein älterer, der danach erst auflöst, darf den
 *  Merker des neueren nicht überschreiben. */
let letzterJoin: number | null = null;

/** Ergebnis eines nativen Joins:
 *  - `nativ`: die Engine trägt Ton/Mic jetzt, der Web-Pfad wird übersprungen;
 *  - `web`: kein (brauchbares) Plugin oder der Join scheiterte — normal weiter
 *    auf dem Web-Weg;
 *  - `ueberholt`: ein neuerer Join oder ein Leave hat diesen abgelöst, die
 *    Engine hat den Raum schon freigegeben. Still aufhören — KEIN Rückfall,
 *    sonst baute ein überholter `connect()` noch einen Web-Raum auf. */
export type NativerJoin = 'nativ' | 'web' | 'ueberholt';

/** So weist die Engine einen abgelösten Join ab (`VoiceEngine.kt`). */
const UEBERHOLT = 'Join überholt';

/** Nativen Join versuchen. `tag` trennt die Konsumenten ('voice' |
 *  'anruf:<id>'). */
export async function nativeVoiceJoin(
  resp: { ws_url: string; token: string },
  echoCancellation: boolean,
  noiseSuppression: boolean,
  joinId: number,
  tag = 'voice'
): Promise<NativerJoin> {
  if (!nativeVoiceErlaubt()) return 'web';
  letzterJoin = joinId;
  try {
    await plugin.join({
      ws_url: resp.ws_url,
      token: resp.token,
      echoCancellation,
      noiseSuppression,
      tag,
      joinId
    });
    if (letzterJoin === joinId) aktiveJoinId = joinId;
    return 'nativ';
  } catch (e) {
    if (e instanceof Error && e.message.includes(UEBERHOLT)) return 'ueberholt';
    console.warn('[nativeVoice] join fehlgeschlagen — Fallback auf Web-Engine', e);
    return 'web';
  }
}

/** Native Engine abmelden.
 *
 *  Mit `joinId` (überholter Join): nur genau diesen Raum — Rückgabe `true`.
 *  Ohne: `true` = sie trug den Ton (oder hielt einen Raum, den diese Session
 *  noch nicht kannte, etwa einen Join, der gerade erst stand) und räumt jetzt
 *  ab; `false` = nichts zu tun, der Web-Pfad darf normal weiterlaufen. */
export async function nativeVoiceLeave(joinId?: number): Promise<boolean> {
  if (!nativeVoiceErlaubt()) return false;
  try {
    if (joinId !== undefined) {
      if (aktiveJoinId === joinId) aktiveJoinId = null;
      await plugin.leave({ joinId });
      return true;
    }
    if (aktiveJoinId === null) {
      const s = await plugin.state();
      if (!s.connected) return false;
    }
    aktiveJoinId = null;
    await plugin.leave({});
    return true;
  } catch (e) {
    if (joinId === undefined) aktiveJoinId = null;
    console.warn('[nativeVoice] leave fehlgeschlagen', e);
    return false;
  }
}

/** Nach einem WebView-Reload: die Engine lebt im APK-Prozess weiter und
 *  sendet womöglich noch Mikrofon, während die Oberfläche „nicht verbunden"
 *  zeigt. Hält sie einen Raum, den diese Session nicht kennt, wird er
 *  abgebaut — sofern `aktuell()` nach der Abfrage noch gilt (kein Beitritt
 *  inzwischen). Fehlt das Plugin, fällt der Aufruf still durch. */
export async function nativeVoiceWaiseAbbauen(aktuell: () => boolean): Promise<boolean> {
  if (!nativeVoiceErlaubt() || aktiveJoinId !== null) return false;
  try {
    const s = await plugin.state();
    if (!s.connected || !aktuell() || aktiveJoinId !== null) return false;
    await plugin.leave({});
    return true;
  } catch (e) {
    console.warn('[nativeVoice] Waisen-Abgleich fehlgeschlagen', e);
    return false;
  }
}

/** Merker zurücksetzen, wenn die ENGINE sich selbst getrennt hat (Snapshot
 *  state=disconnected) — sonst bliebe die Fassade im native-Modus hängen. */
export function nativeVoiceReset(): void {
  aktiveJoinId = null;
}

/** Trägt die native Engine gerade Ton/Mic dieser Session? */
export function nativeVoiceEngaged(): boolean {
  return aktiveJoinId !== null;
}

/** Snapshot-Listener anhängen (einmal pro Join). */
export async function nativeVoiceListen(
  cb: (snapshot: NativeVoiceSnapshot) => void
): Promise<PluginListenerHandle | null> {
  if (!nativeVoiceErlaubt()) return null;
  try {
    return await plugin.addListener('voice', (data) => {
      try {
        cb(JSON.parse(data.snapshot) as NativeVoiceSnapshot);
      } catch (e) {
        console.warn('[nativeVoice] Snapshot unparsebar', e);
      }
    });
  } catch (e) {
    console.warn('[nativeVoice] addListener fehlgeschlagen', e);
    return null;
  }
}

/** Mikrofon nativ publishen/zurückziehen (Permission fragt das Plugin ab). */
export async function nativeSetMicEnabled(on: boolean): Promise<void> {
  await plugin.setMicEnabled({ on });
}

/** Taub-Schaltung nativ (nur Wiedergabe — Mic-Kopplung macht die Fassade). */
export async function nativeSetDeafened(on: boolean): Promise<void> {
  try {
    await plugin.setDeafened({ on });
  } catch (e) {
    console.warn('[nativeVoice] setDeafened fehlgeschlagen', e);
  }
}

/** voice.*-Klang nativ im Anrufkanal abspielen (SoundPool, siehe P5). */
export async function nativePlaySound(id: string): Promise<void> {
  try {
    await plugin.playSound({ id });
  } catch (e) {
    console.warn('[nativeVoice] playSound fehlgeschlagen', e);
  }
}

/** Aktuellen Teilnehmer-Stand ziehen — direkt nach dem Anhängen des
 *  Listeners, sonst ginge der beim Connect gefeuerte erste Snapshot verloren. */
export async function nativeVoiceSnapshot(): Promise<void> {
  try {
    await plugin.snapshot();
  } catch (e) {
    console.warn('[nativeVoice] snapshot fehlgeschlagen', e);
  }
}
