import test from 'node:test';
import assert from 'node:assert/strict';
import { plannerLang } from '../../src/planner/lang.ts';

test('planner: idioma pelo caminho, depois ?lang, depois o salvo, senão inglês', () => {
  assert.equal(plannerLang('/pt/planner', '', null), 'pt');
  assert.equal(plannerLang('/es/planner/', '', 'pt'), 'es');
  assert.equal(plannerLang('/planner', '?lang=es', 'pt'), 'es');
  assert.equal(plannerLang('/planner', '', 'pt'), 'pt');
  assert.equal(plannerLang('/planner', '', 'xx'), 'en');
  assert.equal(plannerLang('/planner.html', '', null), 'en');
});
