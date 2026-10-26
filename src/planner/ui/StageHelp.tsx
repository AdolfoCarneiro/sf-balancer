// "? Como mexer" da tela da etapa: abre os passos do tutorial desta área (ancorados nos data-tour="stage-…"). As cores
// do desenho entram embaixo do passo do desenho.
import { t } from '../../i18n/index.js';
import { TourHelp, useTourExtra } from './Tour.tsx';

export function StageHelp({ items }: { items: { name: string; color: string }[] }) {
  useTourExtra('stage-drawing', (
    <ul className="pl-legend2 pl-tour-legend" aria-label={t('plLegend')}>
      {items.map(it => <li key={it.name}><i style={{ background: it.color }} />{it.name}</li>)}
      <li><i className="pl-sq" style={{ background: 'var(--flow)' }} />Splitter</li>
      <li><i className="pl-sq" style={{ background: 'var(--ficsit)' }} />Merger</li>
      <li><i className="pl-sq pl-sq-lift" />Conveyor Lift</li>
      <li className="pl-dim">{t('plSvFoundation')}</li>
    </ul>
  ));
  return <TourHelp area="stage" tour="stage-help" />;
}
