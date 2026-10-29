import { boot } from './boot.tsx';

// A entrada do index.html (a Fábrica: /, /pt, /es). O Balancer só baixa quando a aba dele abre (ou o navegador está à toa).
void boot(null);
