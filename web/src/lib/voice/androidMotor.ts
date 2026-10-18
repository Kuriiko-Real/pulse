import { ConnectionState } from 'livekit-client';
import type { PluginListenerHandle } from '@capacitor/core';

import { m } from '$lib/paraglide/messages.js';
import { guilds } from '$lib/stores/guilds.svelte';
import { settings } from '$lib/stores/settings.svelte';
import { sounds } from '$lib/sounds/engine';
import { setMicService } from '$lib/platform/audioRoute';
import {
  nativeSetDeafened,
  nativeSetMicEnabled,
  nativeVoiceJoin,
  nativeVoiceLeave,
  nativeVoiceListen,
  nativeVoiceReset,
  nativeVoiceSnapshot,
  nativeVoiceWaiseAbbauen,
  type NativeVoiceSnapshot
} from '$lib/platform/nativeVoice';
import { snapshotGehoertKanal, teilnehmerAusMotor } from './androidMotorSnapshot';
import type { VoiceParticipant } from './teilnehmer';
import { voiceState } from './state.svelte';

/** Fehlertext eines gescheiterten nativen Mikrofon-Schaltens. */
function mikroFehler(e: unknown): string {
  return e instanceof Error ? e.message : m.livekit_microphone_access_failed();
}

/** Die Felder des Voice-Stores, die der Motor liest und schreibt. */
export interface MotorWirt {
  state: ConnectionState;
  error: string | null;
  micEnabled: boolean;
  deafened: boolean;
  participants: VoiceParticipant[];
  readonly pttMode: boolean;
}

/** Die privaten Haken des Voice-Stores, die der Motor braucht. */
export interface MotorHaken {
  /** Stand an den Gateway melden + Resume-Eintrag schreiben (`#publishSelfState`). */
  melden(): void;
  /** Alles abräumen (`#teardown`). */
  abbauen(): void;
  vorTaubSetzen(mikroVorher: boolean): void;
  /** Gehört dieser Beitritt noch dem Store (`gen === #connectGen`)? */
  aktuell(gen: number): boolean;
  /** Admin-Stummschaltung für uns im Kanal (`#selfOverride().muted`). */
  adminStumm(): boolean;
  /** Routen-Diagnose und Route-Anzeige nach ~2,5 s (`routenDiagnose.ts`). */
  diagnosePlanen(): void;
}

/**
 * Der Android-Sprachmotor (APK, `VoiceEngine.kt`): die native Engine trägt
 * Ton UND Mikrofon komplett selbst (USAGE_VOICE_COMMUNICATION → Anruf-Regler,
 * intern/docs/UEBERGABE-MOBILE-VOICE-NATIV.md). Es gibt keinen JS-`Room`; die
 * Engine wirft Snapshots, die hier in dieselben Stores laufen wie die
 * Web-Raum-Ereignisse — die Oberfläche sieht keinen Unterschied.
 *
 * **Eigene Datei, weil `livekit.svelte.ts` ein Vielfaches über der
 * Grössen-Policy liegt** (Muster `nativerRaum.svelte.ts`). Der Store ruft
 * hier hinein; die Weichen bleiben dort sichtbar. **Ohne Runes** — schlichtes
 * `.ts` (CLAUDE.md: eine Rune ausserhalb `.svelte(.ts)` reisst die Route ab).
 *
 * Dem SDK gehört der Audio-Modus (Übergabe §5 Punkt 2, sonst Mode-Ping-Pong):
 * deshalb kein `setVoiceActive`, nur der Mic-Foreground-Service
 * (Screen-Lock-Schutz) über `setMicService`.
 */
export class AndroidMotor {
  #wirt: MotorWirt;
  #haken: MotorHaken;
  /** Trägt der Motor die laufende Sitzung? Bis `abbauen` gesetzt — auch über
   *  das Leave hinaus, damit `#teardown` den richtigen Abbau wählt. */
  #traegt = false;
  #hoerer: PluginListenerHandle | null = null;
  /** Je Anhängen/Abhängen hochgezählt: ein Handle, das erst nach dem Abbau
   *  ankommt, wird sofort wieder entfernt statt liegen zu bleiben. */
  #hoererGen = 0;

  constructor(wirt: MotorWirt, haken: MotorHaken) {
    this.#wirt = wirt;
    this.#haken = haken;
  }

  get traegt(): boolean {
    return this.#traegt;
  }

  /** Beitreten über die Engine. `true` = der Motor hat den Beitritt
   *  übernommen (oder er ist überholt) — `connect()` kehrt zurück; `false` =
   *  Rückfall auf den Web-Weg. Spiegelt den Web-Pfad: Start-Stumm/-Taub,
   *  PTT, Admin-Stummschaltung, Meldung an den Gateway. */
  async verbinden(
    resp: { ws_url: string; token: string },
    channelId: string,
    gen: number,
    opts: { startMuted?: boolean; startDeafened?: boolean; micBeforeDeafen: boolean }
  ): Promise<boolean> {
    const ergebnis = await nativeVoiceJoin(
      resp,
      settings.audio.echoCancellation,
      settings.audio.noiseSuppression !== 'off',
      gen
    );
    if (ergebnis === 'web') return false;
    if (ergebnis === 'ueberholt') return true;
    const w = this.#wirt;
    const h = this.#haken;
    // Überholt, während die Engine verband: GENAU diesen Raum abbauen — die
    // `joinId` sorgt dafür, dass ein inzwischen gestarteter neuerer nicht
    // mitgerissen wird (die Engine ist ein Singleton).
    if (!h.aktuell(gen)) {
      await nativeVoiceLeave(gen);
      return true;
    }
    this.#traegt = true;
    w.state = ConnectionState.Connected;
    voiceState.channelId = channelId;
    voiceState.connected = true;
    void this.#hoererAnhaengen();
    void setMicService(true);
    // Die Taub-Schaltung der Engine an den hiesigen Zustand koppeln: die
    // Engine überlebt Reloads, ihr Taub-Flag also auch — hier ist Wahrheit.
    const taub = Boolean(opts.startDeafened);
    void nativeSetDeafened(taub);
    w.micEnabled = !w.pttMode && !(opts.startMuted || taub);
    if (w.micEnabled) {
      // Wie der Web-Pfad (Entscheidung 2e): eine bekannte Admin-
      // Stummschaltung klar benennen statt eines Geräte-Fehlers.
      if (h.adminStumm()) {
        w.micEnabled = false;
        w.error = m.voice_admin_mute_aktiv();
      } else {
        try {
          await nativeSetMicEnabled(true);
        } catch (e) {
          if (!h.aktuell(gen)) return true;
          w.micEnabled = false;
          w.error = h.adminStumm() ? m.voice_admin_mute_aktiv() : mikroFehler(e);
        }
        if (!h.aktuell(gen)) return true;
      }
    }
    // Taub wiederherstellen (Kanalwechsel, Reload-Resume) — samt Mikrofon-
    // Stand von vorher, sonst bliebe das Mikrofon nach dem Ent-Tauben aus.
    if (taub) {
      w.deafened = true;
      h.vorTaubSetzen(opts.micBeforeDeafen);
    }
    h.melden();
    h.diagnosePlanen();
    // Join-Klang — läuft über `nativerKlang.ts` nativ im Anrufkanal.
    sounds.play('voice.self_join', { guildId: guilds.guildIdForChannel(channelId) });
    return true;
  }

  /** Auflegen. Der Verlass-Klang spielt VOR dem Leave, solange die Engine
   *  noch trägt — danach landete er im Medien-Regler. `true` = es gab einen
   *  nativen Raum (getragen oder unbekannt); der Store räumt dann ohne
   *  Web-Raum ab. */
  async verlassen(soundCtx: { guildId: string | null }): Promise<boolean> {
    const trug = this.#traegt;
    if (trug) sounds.play('voice.self_leave', soundCtx);
    const weg = await nativeVoiceLeave();
    return trug || weg;
  }

  /** Mikrofon über die Bridge (Permission fragt das Plugin ab). Wie im
   *  Web-Pfad: optimistisch setzen, im Fehlerfall zurück, danach melden.
   *
   *  RNNoise und Lokalmeter hängen an WebAudio und laufen hier nicht — die
   *  DSP macht das SDK. Pegel und Sprech-Ring der ANDEREN liefert der eigene
   *  Pegel-Abgriff der Engine (`VoiceEngine.kt::levelSinkFor`); der hängt nur
   *  an fernen Spuren. Der eigene Pegel (`localMicLevel`) und die eigene
   *  Sprech-Anzeige bleiben auf diesem Weg deshalb aus (Stand 2026-10-18). */
  async mikrofon(on: boolean): Promise<void> {
    const w = this.#wirt;
    const vorher = w.micEnabled;
    w.micEnabled = on;
    try {
      await nativeSetMicEnabled(on);
    } catch (e) {
      // Inzwischen abgebaut (Snapshot 'disconnected' → #teardown): der
      // Zustand gehört nicht mehr uns — keine Rücksetzung, keine Meldung.
      if (!this.#traegt) return;
      w.micEnabled = vorher;
      w.error = mikroFehler(e);
    }
    if (!this.#traegt) return;
    // Gegenstück zu `#refreshParticipants`: die eigene Zeile (micMuted)
    // kommt aus dem nächsten Snapshot — sofort einen ziehen.
    void nativeVoiceSnapshot();
    this.#haken.melden();
  }

  /** Taub nativ (nur Wiedergabe — die Mikrofon-Kopplung macht der Store
   *  über `setMicEnabled`). */
  taub(on: boolean): void {
    void nativeSetDeafened(on);
  }

  /** Teil von `#teardown`. `true` = der Motor trug die Sitzung — dann gehört
   *  der Audio-Modus dem SDK, der Store stoppt nur den Mic-Dienst. */
  abbauen(): boolean {
    this.#hoererAbhaengen();
    const trug = this.#traegt;
    this.#traegt = false;
    if (trug) nativeVoiceReset();
    return trug;
  }

  /** Nach einem WebView-Reload eine verwaiste Engine abbauen, die noch
   *  Mikrofon sendet, während die Oberfläche „nicht verbunden" zeigt
   *  (`nativUebernehmen` beim Start; ein Resume tritt danach frisch bei). */
  async waiseAbbauen(aktuell: () => boolean): Promise<void> {
    if (this.#traegt) return;
    await nativeVoiceWaiseAbbauen(aktuell);
  }

  async #hoererAnhaengen(): Promise<void> {
    this.#hoererAbhaengen();
    const gen = this.#hoererGen;
    const handle = await nativeVoiceListen((data) => this.#snapshot(data));
    if (gen !== this.#hoererGen) {
      void handle?.remove();
      return;
    }
    this.#hoerer = handle;
    // Den Stand gleich ziehen — der beim Connect gefeuerte erste Snapshot
    // kam, bevor der Hörer hing.
    void nativeVoiceSnapshot();
  }

  #hoererAbhaengen(): void {
    this.#hoererGen++;
    void this.#hoerer?.remove();
    this.#hoerer = null;
  }

  #snapshot(data: NativeVoiceSnapshot): void {
    if (!this.#traegt || !snapshotGehoertKanal(data)) return;
    if (data.state === 'disconnected') {
      // Die ENGINE ist weg (Netz/Server) — wie RoomEvent.Disconnected:
      // kompletter Abbau inkl. Gateway-Meldung.
      this.#haken.abbauen();
      return;
    }
    const w = this.#wirt;
    if (data.state) {
      w.state = data.state as ConnectionState;
      voiceState.connected = data.state === 'connected';
    }
    if (data.participants) w.participants = teilnehmerAusMotor(data.participants);
  }
}
