import type { Nav } from '../shell/SiteBar.tsx';

// A página Balancer é carregada sob demanda: a Fábrica não paga por ela.
export const loadBalancer = () => import('./Balancer.tsx');
export type BalancerModule = Awaited<ReturnType<typeof loadBalancer>>;

export function BalancerPage({ mod, nav, active }: { mod: BalancerModule; nav: Nav; active: boolean }) {
  const { Balancer } = mod;
  return <Balancer nav={nav} active={active} />;
}
