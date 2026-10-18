import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { snapshotGehoertKanal, teilnehmerAusMotor } from '../src/lib/voice/androidMotorSnapshot.ts';
import { nativerKlangWeg } from '../src/lib/sounds/nativerKlang.ts';

// Der Android-Sprachmotor (VoiceEngine.kt) liefert rohe Snapshots; die
// Oberfläche muss sie so sehen wie die Zeilen eines Web-Raums.

const zeile = (o: Partial<Parameters<typeof teilnehmerAusMotor>[0][number]>) => ({
  identity: 'user-1',
  name: 'x',
  isLocal: false,
  isSpeaking: false,
  audioLevel: 0,
  micMuted: false,
  cameraOn: false,
  connectionQuality: 'excellent',
  ...o
});

test('eigene Zeile zuerst, die übrigen nach Namen', () => {
  const out = teilnehmerAusMotor([
    zeile({ identity: 'user-3', name: 'Zora' }),
    zeile({ identity: 'user-2', name: 'Anna' }),
    zeile({ identity: 'user-1~ab12', name: 'Ich', isLocal: true })
  ]);
  assert.deepEqual(
    out.map((p) => p.name),
    ['Ich', 'Anna', 'Zora']
  );
});

test('leerer Name fällt auf die Identität zurück, userId aus der Identität', () => {
  const [p] = teilnehmerAusMotor([zeile({ identity: 'user-42~ff', name: '  ' })]);
  assert.equal(p.name, 'user-42~ff');
  assert.equal(p.userId, '42');
  const [q] = teilnehmerAusMotor([zeile({ identity: 'gast' })]);
  assert.equal(q.userId, null);
});

test('fehlender Pegel wird 0', () => {
  const [p] = teilnehmerAusMotor([
    zeile({ audioLevel: undefined as unknown as number })
  ]);
  assert.equal(p.audioLevel, 0);
});

test('nur Sprachkanal-Snapshots (oder ohne Etikett) gehören dem Kanal', () => {
  assert.equal(snapshotGehoertKanal({ tag: 'voice' }), true);
  assert.equal(snapshotGehoertKanal({}), true);
  assert.equal(snapshotGehoertKanal({ tag: 'anruf:7' }), false);
});

test('Klang: nativ nur für voice.* bei tragendem Motor, still bei Schalter aus', () => {
  assert.equal(nativerKlangWeg('voice.self_join', true, 0.5), 'nativ');
  assert.equal(nativerKlangWeg('voice.self_join', true, 0), 'still');
  assert.equal(nativerKlangWeg('voice.self_join', false, 0), 'web');
  assert.equal(nativerKlangWeg('message.mention', true, 0.5), 'web');
});
