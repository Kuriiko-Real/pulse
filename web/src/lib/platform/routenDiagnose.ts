import { maybeSendAudioDiagnostic } from './audioRoute';
import { audioRouteState } from './audioRouteState.svelte';

/**
 * Die Routen-Diagnose nach einem Beitritt (Android), für Web-Raum und
 * Android-Motor gleich. Aus `livekit.svelte.ts` gezogen (Grössen-Policy).
 *
 * Capture a routing snapshot once the OS has settled the route (~2.5s), to
 * verify the SCO/mode result in the field. No-op off Capacitor-Android.
 * `abbrechen` in #teardown, so a channel switch within the delay doesn't fire
 * a stale (and post-release, misleading) snapshot.
 */
export class RoutenDiagnose {
  #timer: ReturnType<typeof setTimeout> | null = null;

  planen(): void {
    this.abbrechen();
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void maybeSendAudioDiagnostic();
      // Route-UI nachziehen: war BT schon VOR dem Join verbunden, gibt es
      // kein Geräte-Add (keinen routesChanged-Push), und die Mount-Abfrage
      // lief vor der ersten Weg-Wahl des nativen Motors — das Icon blieb
      // sonst bis zum nächsten Popup-Öffnen auf Lautsprecher.
      void audioRouteState.aktualisieren();
    }, 2500);
  }

  abbrechen(): void {
    if (this.#timer === null) return;
    clearTimeout(this.#timer);
    this.#timer = null;
  }
}
