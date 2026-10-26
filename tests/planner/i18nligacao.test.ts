import test from 'node:test';
import assert from 'node:assert/strict';
import pt from '../../src/i18n/pt.js';
import en from '../../src/i18n/en.js';
import es from '../../src/i18n/es.js';

// O builder chama o antigo "meio" de Ligação / Connection / Conexión. A página Balancer (chaves sem o prefixo pl)
// continua com "Meio" como nome do trecho.
// Exceção: o modelo de fileiras "Mergers no meio" (o corredor do meio, nome dado pelo dono), não a ligação.
const NAMES = new Set(['plRowsModelCenter']);
const RULES: [string, Record<string, unknown>, RegExp][] = [
  ['pt', pt, /\bmeios?\b/i], ['en', en, /\bmiddles?\b/i], ['es', es, /\bmedios?\b/i],
];

test('nenhum texto do builder fala em meio', () => {
  for (const [lang, dict, bad] of RULES) {
    const hits: string[] = [];
    for (const [k, v] of Object.entries(dict)) {
      if (!/^pl[A-Z]/.test(k) || NAMES.has(k)) continue;
      const text = typeof v === 'function' ? String(v('1', '2', '3')) : String(v);
      if (bad.test(text)) hits.push(`${k}: ${text}`);
    }
    assert.deepEqual(hits, [], lang);
  }
});

test('chaves novas da ligação nos três idiomas', () => {
  for (const dict of [pt, en, es] as Record<string, unknown>[]) {
    for (const k of ['plLigReset', 'plLigMoveHint']) assert.equal(typeof dict[k], 'string', k);
  }
});
