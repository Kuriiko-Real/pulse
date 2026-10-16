import { test } from 'node:test';
import assert from 'node:assert/strict';

import { androidLaedtDirekt, ladeknopf } from '../src/lib/platform/speicherWeg.ts';

// iOS-Bughunt 2, F2: auf Android holte die App auch für Klartext-Anhänge
// erst einen Blob, und die Hülle verwirft `blob:`-Downloads — es geschah
// nichts. Echte Adressen gehen wieder als Anker an den Download-Manager.

test('Klartext-Adressen lädt der Download-Manager direkt', () => {
  assert.equal(androidLaedtDirekt('https://howispulse.com/pulse-attachments/a.pdf?X-Amz=1'), true);
  assert.equal(androidLaedtDirekt('http://127.0.0.1:9000/pulse-attachments/a.pdf'), true);
});

test('blob: und data: kann er nicht — die bleiben beim Teilen-Weg', () => {
  assert.equal(androidLaedtDirekt('blob:https://howispulse.com/1234'), false);
  assert.equal(androidLaedtDirekt('data:application/pdf;base64,AAAA'), false);
  assert.equal(androidLaedtDirekt('/relativ/pfad'), false);
});

// Eigentümer-Grundsatz 2026-10-16: nur die iOS-Hülle bekommt den Teilen-Knopf.
test('ladeknopf: iOS-Hülle ein Knopf, sonst der Anker von vorher', () => {
  assert.deepEqual(ladeknopf('https://x/a.pdf', 'a.pdf', true), {
    tag: 'button',
    attribute: { type: 'button' }
  });
  assert.deepEqual(ladeknopf('https://x/a.pdf', 'a.pdf', false), {
    tag: 'a',
    attribute: {
      href: 'https://x/a.pdf',
      target: '_blank',
      rel: 'noopener noreferrer',
      download: 'a.pdf'
    }
  });
});

test('ladeknopf: ohne Namen der Ersatz, ohne Quelle kein href', () => {
  const k = ladeknopf('', null, false);
  assert.equal(k.tag, 'a');
  if (k.tag === 'a') {
    assert.equal(k.attribute.download, 'anhang');
    assert.equal(k.attribute.href, undefined);
  }
});
