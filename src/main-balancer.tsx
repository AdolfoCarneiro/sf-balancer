import { boot } from './boot.tsx';
import * as balancer from './balancer/Balancer.tsx';

// A entrada do balancer.html (/balancer, /pt/balancer, /balancer/3-to-4…): já traz o Balancer, para ele montar antes da
// primeira pintura (o #root traz o texto para os buscadores, que não pode aparecer antes do app).
void boot(balancer);
