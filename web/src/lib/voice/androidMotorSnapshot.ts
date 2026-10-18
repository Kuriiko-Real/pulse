/**
 * Aufbereitung der Snapshots des Android-Sprachmotors (`VoiceEngine.kt`) —
 * die reine Rechnung, ohne Laufzeit-Import aus Nachbarn ohne Endung (Nodes
 * Testläufer, CLAUDE.md „Die Falle"). Verdrahtet in `androidMotor.ts`.
 */
import type { ConnectionQuality } from 'livekit-client';
import type {
  NativeParticipantSnapshot,
  NativeVoiceSnapshot
} from '$lib/platform/nativeVoice';
import { userIdFromIdentity } from './identity.ts';
import type { VoiceParticipant } from './teilnehmer';

/** Derselbe Kollator-Gedanke wie in `teilnehmer.ts`: einmal anlegen statt
 *  `localeCompare` je Vergleich. */
const NAME_COLLATOR = new Intl.Collator();

/** Gehört der Snapshot dem Sprachkanal? Anruf-Räume (`anruf:<id>`) laufen
 *  über dieselbe Engine und tragen ihr eigenes Etikett; ein Snapshot ohne
 *  Etikett stammt von einem APK vor dem Etikett und gilt als unserer. */
export function snapshotGehoertKanal(data: NativeVoiceSnapshot): boolean {
  return data.tag === undefined || data.tag === 'voice';
}

/** Die Teilnehmerzeilen so, wie `teilnehmer.ts::teilnehmerListe` sie für den
 *  Web-Raum baut: Name-Rückfall auf die Identität, `userId` aus der
 *  Identität, eigene Zeile zuerst, die übrigen nach Namen. */
export function teilnehmerAusMotor(list: NativeParticipantSnapshot[]): VoiceParticipant[] {
  return list
    .map((p) => ({
      identity: p.identity,
      name: p.name && p.name.trim() ? p.name : p.identity,
      userId: userIdFromIdentity(p.identity),
      isLocal: !!p.isLocal,
      isSpeaking: !!p.isSpeaking,
      audioLevel: p.audioLevel ?? 0,
      micMuted: !!p.micMuted,
      cameraOn: !!p.cameraOn,
      connectionQuality: p.connectionQuality as ConnectionQuality
    }))
    .sort((a, b) =>
      a.isLocal === b.isLocal ? NAME_COLLATOR.compare(a.name, b.name) : a.isLocal ? -1 : 1
    );
}
