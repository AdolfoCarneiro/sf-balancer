// O Chromium já instalado pelo Playwright (nunca baixa browser); CHROME_PATH sobrepõe. Usado pela captura e pelo smoke.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const root = path.join(os.homedir(), '.cache', 'ms-playwright');
  if (!fs.existsSync(root)) throw new Error(`Chromium não encontrado: ${root} não existe. Instale um browser do Playwright ou defina CHROME_PATH.`);
  const dirs = fs.readdirSync(root).filter(d => /^chromium-\d+$/.test(d)).sort();
  for (const d of dirs.reverse()) {
    const p = path.join(root, d, 'chrome-linux64', 'chrome');
    if (fs.existsSync(p)) return p;
  }
  throw new Error('nenhum chromium em ' + root);
}

export function chromeOrExit() {
  try { return chromePath(); } catch (e) { console.error(e.message); process.exit(1); }
}
