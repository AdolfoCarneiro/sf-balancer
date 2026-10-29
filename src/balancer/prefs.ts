// O que a bancada lembra entre visitas, comum à página Balancer e ao modal da ligação da Fábrica: os campos do gerador da
// biblioteca, a aba e a montagem abertas, como mostrar o 3D e o 2D, e os blueprints que eu tenho.
import { useSyncExternalStore } from 'react';

export interface Blueprint { n: number; m: number }
export interface LibPrefs {
  n: string; m: string; rate: string; belt: string;   // o gerador (texto, como digitado)
  view: string | null;   // a montagem aberta no gerador (null = a melhor)
  style: string;         // aba: normal | butterfly | 3d
  mode3d: string; mode3dBf: string;   // 3D em torres ou andares (a borboleta guarda à parte)
  per3d: string;         // passo a passo por nível ou por peça
  view2d: string;        // 2D em esquema ou planta
}

const LIB_STORE = 'sf-balancer:lib';
const BP_STORE = 'sf-balancer:bp';

function load<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; }
}
function store(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* sem storage */ }
}

let lib: LibPrefs = { n: '2', m: '5', rate: '240', belt: 'Mk4', view: null, style: 'normal', mode3d: 'towers', mode3dBf: 'floors', per3d: 'level', view2d: 'scheme' };
lib = { ...lib, ...load<Partial<LibPrefs>>(LIB_STORE, {}) };
if (lib.style === 'vertical') lib.style = '3d';   // a antiga aba Vertical abre no 3D
let bps: Blueprint[] = [{ n: 3, m: 4 }];
const savedBps = load<unknown>(BP_STORE, null);
if (Array.isArray(savedBps)) bps = savedBps.filter(b => b && b.n >= 1 && b.m >= 2);

const subs = new Set<() => void>();
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const notify = () => subs.forEach(f => f());

export const getLib = () => lib;
export function setLib(patch: Partial<LibPrefs>) {
  lib = { ...lib, ...patch };
  store(LIB_STORE, lib);
  notify();
}
export const getBps = () => bps;
export function setBps(next: Blueprint[]) {
  bps = next;
  store(BP_STORE, bps);
  notify();
}
export const useLib = () => useSyncExternalStore(subscribe, getLib);
export const useBps = () => useSyncExternalStore(subscribe, getBps);
