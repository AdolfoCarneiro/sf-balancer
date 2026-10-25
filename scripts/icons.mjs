// Baixa os ícones do jogo e grava public/icons/<id>.webp (64x64) e src/planner/data/icons.json.
//
// Uso: node scripts/icons.mjs   (precisa de Node 22 e ImageMagick `magick` no PATH; não roda no build)
//
// Fonte fixada no commit bbd951f26507432d3e50923fb02d0348829b0752 de rockfactory/satisfactory-logistics
// (raw.githubusercontent.com). O mapa id -> imagem vem de src/recipes/FactoryItems.json e
// FactoryBuildings.json desse commit (campo imagePath, ex. /images/game/iron-ingot_256.png); baixa a
// versão _64.png de public/images/game/. Ícones © Coffee Stain Studios. Os PNGs baixados ficam numa
// pasta temporária fora do repo e nada baixado é executado.
// Id sem imagem ou download que falha: aviso no console e fica fora de icons.json.
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const COMMIT = 'bbd951f26507432d3e50923fb02d0348829b0752';
const RAW = `https://raw.githubusercontent.com/rockfactory/satisfactory-logistics/${COMMIT}`;
const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = resolve(aqui, '..');
const game = JSON.parse(readFileSync(resolve(raiz, 'src/planner/data/game.json'), 'utf8'));

// Espelha SPECIAL_ICON de src/planner/ui/icons.ts.
const ESPECIAIS = ['Build_MinerMk1_C', 'Build_ResourceSink_C', 'Build_StorageContainerMk1_C', 'Build_PipeStorageTank_C',
  'Build_TrainDockingStation_C', 'Build_ConveyorAttachmentSplitter_C', 'Build_ConveyorAttachmentMerger_C'];
const ids = [...new Set([...Object.keys(game.items), ...Object.keys(game.buildings), ...Object.keys(game.extractors), ...ESPECIAIS])].sort();

const json = async caminho => {
  const r = await fetch(`${RAW}/${caminho}`);
  if (!r.ok) throw new Error(`${caminho}: HTTP ${r.status}`);
  return r.json();
};
const mapa = {};
for (const arq of ['src/recipes/FactoryItems.json', 'src/recipes/FactoryBuildings.json']) {
  for (const e of await json(arq)) if (e.id && e.imagePath) mapa[e.id] = e.imagePath;
}

const tmp = mkdtempSync(join(tmpdir(), 'sf-icons-'));
const saida = resolve(raiz, 'public/icons');
mkdirSync(saida, { recursive: true });
const gravados = [];
for (const id of ids) {
  const caminho = mapa[id]?.replace(/_256\.png$/, '_64.png');
  if (!caminho) { console.warn(`sem imagePath: ${id}`); continue; }
  try {
    const r = await fetch(`${RAW}/public${caminho}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const png = join(tmp, `${id}.png`);
    writeFileSync(png, Buffer.from(await r.arrayBuffer()));
    execFileSync('magick', [png, '-resize', '64x64', '-quality', '80', join(saida, `${id}.webp`)]);
    gravados.push(id);
  } catch (e) { console.warn(`falhou ${id}: ${e.message}`); }
}
writeFileSync(resolve(raiz, 'src/planner/data/icons.json'), JSON.stringify(gravados, null, 1) + '\n');
console.log(`${gravados.length}/${ids.length} ícones → ${saida}`);
