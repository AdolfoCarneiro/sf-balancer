// "Como funciona", as perguntas e o rodapé da página Balancer: só texto.
import { memo } from 'react';
import { t } from '../i18n/index.js';
import { EXT_MOD, extBpUrl, extLink } from './Workbench.tsx';

// lang: só para o memo redesenhar quando o idioma muda.
export const Guide = memo(function Guide(_: { lang: string }) {
  const faq = [1, 2, 3, 4, 5, 6];
  return (
    <>
      <section className="guide" id="how" aria-labelledby="howTitle">
        <h2 id="howTitle">{t('guideTitle')}</h2>
        <p className="lead">{t('guideLead')}</p>
        <div className="segs">
          {(['Collect', 'Mid', 'Dist'] as const).map(k => (
            <div key={k} className="plate"><span className="seg-n">{t(`g${k}N`)}</span><h3>{t(`g${k}Title`)}</h3><p>{t(`g${k}`)}</p></div>
          ))}
        </div>
        <div className="guide-cols">
          <div>
            <h3>{t('casesTitle')}</h3>
            <ul>
              {['A', 'B', 'C', 'D'].map(c => <li key={c}><b>{t(`case${c}Name`)}</b> <span>{t(`case${c}Text`)}</span></li>)}
            </ul>
          </div>
          <div>
            <h3>{t('mechTitle')}</h3>
            <ul>
              <li><b>Splitter</b> <span>{t('mechSplitter')}</span></li>
              <li><b>Merger</b> <span>{t('mechMerger')}</span></li>
              <li><b>Smart Splitter</b> <span>{t('mechSmart')}</span></li>
              <li><b>Awesome Sink</b> <span>{t('mechSink')}</span></li>
            </ul>
          </div>
        </div>
        <div className="faq">
          <h3>{t('faqTitle')}</h3>
          {faq.map(i => (
            <details key={i}>
              <summary>{t(`faq${i}Q`)}</summary>
              <p>{t(`faq${i}A`)}</p>
              {i === 5 && <p className="ext" dangerouslySetInnerHTML={{ __html: [extLink(EXT_MOD, 'Modular Load Balancers (ficsit.app)'), extLink(extBpUrl(), t('extBp'))].join(' · ') }} />}
            </details>
          ))}
        </div>
      </section>
      <footer className="site-foot">
        <a href="https://github.com/AdolfoCarneiro/sf-balancer">{t('footSource')}</a>
        <span>{t('footLicense')}</span>
        <a className="coffee" href="https://ko-fi.com/dofal" target="_blank" rel="noopener">{t('footCoffee')}</a>
        <span>{t('footDisclaimer')}</span>
      </footer>
    </>
  );
});
