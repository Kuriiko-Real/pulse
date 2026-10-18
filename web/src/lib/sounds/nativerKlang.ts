/**
 * Welcher Weg ein Klang nimmt, solange der Android-Sprachmotor den Kanal
 * trägt — die reine Entscheidung, ohne Laufzeit-Import (Nodes Testläufer,
 * CLAUDE.md „Die Falle"). Verdrahtet in `engine.ts::play`.
 *
 *  - `web`:   der übliche Weg über `<audio>`/Web Audio.
 *  - `nativ`: der SoundPool der Engine im Anrufkanal — ein `<audio>`-Element
 *             landete im Medien-Regler, genau der Fehler, den der Motor behebt.
 *  - `still`: gar nicht spielen. Der SoundPool kennt keine Lautstärke-Stufen;
 *             ein abgeschalteter Schalter (Gain 0) muss deshalb HIER greifen,
 *             sonst spielte der native Weg trotz „aus".
 */
export type KlangWeg = 'web' | 'nativ' | 'still';

export function nativerKlangWeg(id: string, motorTraegt: boolean, gain: number): KlangWeg {
  if (!motorTraegt || !id.startsWith('voice.')) return 'web';
  return gain > 0 ? 'nativ' : 'still';
}
