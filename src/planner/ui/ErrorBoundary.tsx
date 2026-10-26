// Rede de segurança do builder: um erro ao desenhar a fábrica mostra um aviso com saída, em vez da página em branco.
// "Voltar ao exemplo" troca a fábrica salva pelo exemplo (a que deu erro não volta ao recarregar) e remonta o builder.
import { Component, type ReactNode } from 'react';
import { t } from '../../i18n/index.js';

interface Props { children: ReactNode; onReset: () => void }

export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.error(error); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="pl-app">
        <section className="pl-crash" role="alert">
          <h1>{t('plCrashTitle')}</h1>
          <p>{t('plCrashText')}</p>
          <div className="pl-crash-actions">
            <button type="button" className="pl-btn" onClick={() => { this.props.onReset(); this.setState({ failed: false }); }}>{t('plCrashReset')}</button>
            <button type="button" className="pl-btn" onClick={() => location.reload()}>{t('plCrashReload')}</button>
          </div>
        </section>
      </div>
    );
  }
}
