/**
 * Welcher Weg speichert einen Anhang? — die reine Regel (iOS-Bughunt 2, F2).
 *
 * **Android: eine Klartext-Adresse geht als Anker an den Download-Manager.**
 * Die Android-Hülle reicht einen Download an den System-Download-Manager
 * weiter (`MainActivity.java`, `setDownloadListener`), aber nur für echte
 * Adressen — eine `blob:`-Adresse verwirft sie ausdrücklich, weil der
 * Download-Manager sie nicht laden kann. Seit die Anhänge über
 * `dateiTeilen.ts` gespeichert werden (2026-10-06), holte die Web-App auch
 * auf Android erst einen Blob; ohne `navigator.canShare` in der WebView fiel
 * das auf einen `blob:`-Anker — und der tat nichts. Für Klartext-Adressen
 * gilt deshalb wieder der Anker von vorher.
 *
 * **Verschlüsselte Anhänge bleiben auf Android eine Lücke.** Ihr Klartext
 * entsteht erst im Klienten und liegt nur als `blob:` vor; einen Weg, ihn
 * aus der WebView in den Download-Ordner zu bringen, hat die Android-Hülle
 * nicht (das wäre ein eigenes natives Plugin). Das war vor 2026-10-06
 * genauso.
 *
 * Prüfbar (s. die `pnpm test:unit`-Falle in CLAUDE.md): der einzige Import
 * trägt seine Endung und ist selbst importfrei.
 */
import { dateiNameOderErsatz } from './dateinameErsatz.ts';

export function androidLaedtDirekt(quelle: string): boolean {
  return /^https?:\/\//i.test(quelle);
}

/**
 * Wie ein Lade-Knopf für einen Anhang gebaut ist.
 *
 * **Nur in der iOS-Hülle ein Knopf**, der über `dateiTeilenOderLaden`
 * speichert (Teilen-Blatt — die WKWebView hat keinen Download-Manager).
 * **Überall sonst der Anker von vorher** (`href` + `download` +
 * `target=_blank`): Desktop, Browser und die Android-Hülle (deren
 * Download-Manager genau diesen Anker annimmt, s. oben) verhalten sich damit
 * wie vor der iOS-Arbeit (Eigentümer-Grundsatz 2026-10-16). Ein leerer
 * Dateiname fällt auf den Ersatz zurück — ohne `download` NAVIGIERTE der
 * Klick auf eine `blob:`-Adresse (`dateinameErsatz.ts`).
 */
export type Ladeknopf =
  | { tag: 'button'; attribute: { type: 'button' } }
  | {
      tag: 'a';
      attribute: { href: string | undefined; target: '_blank'; rel: string; download: string };
    };

export function ladeknopf(
  quelle: string | null | undefined,
  dateiname: string | null | undefined,
  iosHuelle: boolean
): Ladeknopf {
  if (iosHuelle) return { tag: 'button', attribute: { type: 'button' } };
  return {
    tag: 'a',
    attribute: {
      href: quelle || undefined,
      target: '_blank',
      rel: 'noopener noreferrer',
      download: dateiNameOderErsatz(dateiname)
    }
  };
}
