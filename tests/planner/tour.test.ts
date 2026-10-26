import test from 'node:test';
import assert from 'node:assert/strict';
import pt from '../../src/i18n/pt.js';
import en from '../../src/i18n/en.js';
import es from '../../src/i18n/es.js';
import { TOUR_STORE, nextShown, targetNames, tourDone, tourSteps } from '../../src/planner/model/tour.ts';

test('tutorial: o completo passa pelas três áreas, cada área só pelos seus', () => {
  const all = tourSteps();
  assert.ok(all.length >= 12);
  for (const a of ['map', 'panel', 'stage'] as const) {
    const s = tourSteps(a);
    assert.ok(s.length >= 3, a);
    assert.ok(s.every(x => x.area === a), a);
    // Na mesma ordem do completo.
    assert.deepEqual(s.map(x => x.id), all.filter(x => x.area === a).map(x => x.id));
  }
  assert.equal(tourSteps('map').length + tourSteps('panel').length + tourSteps('stage').length, all.length);
});

test('tutorial: os passos pedidos estão lá e os ids são únicos', () => {
  const ids = tourSteps().map(s => s.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['new', 'port', 'chip', 'balance', 'panel', 'view', 'together', 'layers', 'block', 'import', 'share']) assert.ok(ids.includes(id), id);
  // O primeiro é criar o bloco (o alvo do botão Novo bloco está sempre na tela do mapa).
  assert.equal(ids[0], 'new');
});

test('tutorial: alvos são nomes data-tour, com alternativas por |', () => {
  for (const s of tourSteps()) {
    const names = targetNames(s.target);
    assert.ok(names.length >= 1, s.id);
    for (const n of names) assert.match(n, /^[a-z][a-z0-9-]*$/, `${s.id}: ${n}`);
  }
  assert.deepEqual(targetNames('panel-warns|panel-toggle'), ['panel-warns', 'panel-toggle']);
});

test('tutorial: título e texto de cada passo existem nos três idiomas', () => {
  for (const s of tourSteps()) {
    for (const [lang, d] of [['pt', pt], ['en', en], ['es', es]] as const) {
      const dict = d as Record<string, unknown>;
      assert.equal(typeof dict[s.title], 'string', `${lang}.${s.title}`);
      assert.equal(typeof dict[s.body], 'string', `${lang}.${s.body}`);
      assert.ok((dict[s.title] as string).length > 0 && (dict[s.body] as string).length > 0);
    }
  }
  for (const k of ['plTourNext', 'plTourBack', 'plTourSkip', 'plTourDone', 'plTourCount', 'plTourAgain', 'plTourHelp', 'plTourHelpOf'])
    for (const d of [pt, en, es]) assert.ok(k in d, k);
});

test('tutorial: alvo ausente pula o passo, nos dois sentidos; sem nenhum, acaba', () => {
  const on = new Set([0, 2, 5]);
  const has = (i: number) => on.has(i);
  assert.equal(nextShown(6, -1, 1, has), 0);
  assert.equal(nextShown(6, 0, 1, has), 2);
  assert.equal(nextShown(6, 2, 1, has), 5);
  assert.equal(nextShown(6, 5, 1, has), null);
  assert.equal(nextShown(6, 5, -1, has), 2);
  assert.equal(nextShown(6, 0, -1, has), null);
  assert.equal(nextShown(6, -1, 1, () => false), null);
});

test('tutorial: lembrado como done ou skipped; o resto (vazio, lixo) mostra de novo', () => {
  assert.equal(TOUR_STORE, 'sf-balancer:planner-tour');
  assert.equal(tourDone('done'), true);
  assert.equal(tourDone('skipped'), true);
  assert.equal(tourDone(null), false);
  assert.equal(tourDone('1'), false);
});
