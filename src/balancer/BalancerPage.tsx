import { useLayoutEffect, useRef } from 'react';
import { SiteBar, type Nav } from '../shell/SiteBar.tsx';

// A página Balancer é JavaScript puro (mount.js e vizinhos), carregada sob demanda: a Fábrica não paga por ela.
export const loadBalancer = () => import('./mount.js');
export type BalancerModule = Awaited<ReturnType<typeof loadBalancer>>;

// O React cuida só da barra de cima; o resto da página é do mount.js, num elemento sem filhos do React (que nunca mexe
// nele). Monta uma vez e fica montada: voltar para cá encontra tudo como estava.
export function BalancerPage({ mod, nav, active }: { mod: BalancerModule; nav: Nav; active: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { mod.mount(host.current); }, [mod]);
  useLayoutEffect(() => { mod.setActive(active); }, [mod, active]);
  return (
    <div className="bal-page">
      <SiteBar nav={nav}><div className="pl-grow" /></SiteBar>
      <div ref={host} />
    </div>
  );
}
