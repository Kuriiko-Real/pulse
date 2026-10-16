/**
 * Textvertrag: die Plugin-Hüllen, die mit der iOS-Arbeit kamen (Statusleiste,
 * Haptik, externe Links, Plakette, Universal Links), wirken NUR in der
 * iOS-Hülle.
 *
 * Anlass (2026-10-16): `mobile/package.json` bringt die Plugins jetzt für
 * beide Hüllen mit. Sobald ein Android-Bau sie enthält, hätte die
 * Android-Hülle Links in Custom Tabs umgelenkt, die Statusleiste aus der
 * Web-App gesetzt und getickt — alles Verhalten, das Android vorher nicht
 * hatte (Eigentümer-Grundsatz: Android wie vor der iOS-Arbeit). Die Module
 * importieren die Plugin-Pakete und sind deshalb nicht direkt ausführbar;
 * geprüft wird die Weiche am Text.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const lies = (pfad: string) => readFileSync(join(webRoot, pfad), 'utf8');

for (const datei of [
  'src/lib/platform/statusLeiste.ts',
  'src/lib/platform/haptik.ts',
  'src/lib/platform/externeLinks.ts',
  'src/lib/platform/badge.ts',
  'src/lib/platform/universalLinks.ts'
]) {
  test(`${datei}: nur iOS, nie Android`, () => {
    const quelle = lies(datei);
    assert.match(quelle, /if \(!isCapacitorIOS\(\)\) return/);
    assert.doesNotMatch(quelle, /isCapacitorAndroid/);
  });
}
