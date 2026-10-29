import { L3D, focus3d, tapGesture, fitDistance } from '../logic/index.js';
import { NRM3 } from '../logic/layout3d.js';
import { inColor } from '../balancer/balancerSvg.js';

// ---- Cena 3D (Three.js sob demanda) ----
// Piso de blueprint, peças chapadas (splitter laranja, merger verde-água), setas no topo com as portas usadas,
// esteira em tubo neon na cor da faixa com contorno escuro, gola + seta (saída) ou anel (entrada) em cada porta,
// pontos de luz andando no sentido do fluxo. Passo atual em holograma pulsando; passar o mouse isola o caminho.
let THREE_P = null;
const load3d = () => (THREE_P ||= Promise.all([import('three'), import('three/addons/controls/OrbitControls.js'), import('three/addons/geometries/RoundedBoxGeometry.js')])
  .then(([T, O, R]) => ({ T, OrbitControls: O.OrbitControls, RoundedBoxGeometry: R.RoundedBoxGeometry }))
  .catch(e => { THREE_P = null; throw e; }));
export const SPLITTER_3D = '#e8863a', MERGER_3D = '#3bb3a8';

export async function mount3d(stage, d, labels, lay, opts = {}) {
  let lib, renderer;
  try { lib = await load3d(); } catch (e) { return null; }
  const { T, OrbitControls, RoundedBoxGeometry } = lib;
  try { renderer = new T.WebGLRenderer({ antialias: true }); } catch (e) { return null; }
  if (!renderer.getContext()) return null;
  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const hex = c => (c.startsWith('var(') ? css(c.slice(4, -1)) : c);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputColorSpace = T.SRGBColorSpace;
  stage.append(renderer.domElement);
  // Rolar a página passa por cima da cena; zoom só com Ctrl (a pinça do touchpad chega como Ctrl + roda).
  // Registrado antes do OrbitControls para cortar o evento antes dele.
  renderer.domElement.addEventListener('wheel', e => { if (!e.ctrlKey && !e.metaKey) e.stopImmediatePropagation(); });
  const scene = new T.Scene();
  scene.background = new T.Color(hex('var(--bench)'));
  scene.add(new T.HemisphereLight(0xffffff, 0x123050, 1.4));
  const key = new T.DirectionalLight(0xffffff, 1.7);
  key.position.set(30, 70, 45);
  const fill = new T.DirectionalLight(0x9fc2ff, 0.5);
  fill.position.set(-40, 15, -20);
  scene.add(key, fill);

  const { min, max } = lay.bounds;
  const center = new T.Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  const canvasTex = (w, h, draw) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tx = new T.CanvasTexture(c);
    tx.colorSpace = T.SRGBColorSpace;
    tx.anisotropy = 4;
    return tx;
  };

  // Piso de blueprint: grade das fundações (8 m) e meia grade (4 m), sumindo nas bordas.
  const span = Math.ceil((Math.max(max[0] - min[0], max[2] - min[2]) + 40) / 8) * 8;
  const floorTex = canvasTex(1024, 1024, (g, w, h) => {
    const n = span / 4, cell = w / n;
    g.fillStyle = '#0f3150'; g.fillRect(0, 0, w, h);
    for (let i = 0; i <= n; i++) {
      const x = i * cell, major = i % 2 === 0;
      g.strokeStyle = major ? 'rgba(111,200,255,.38)' : 'rgba(111,200,255,.13)';
      g.lineWidth = major ? 3 : 1.2;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.moveTo(0, x); g.lineTo(w, x); g.stroke();
    }
    g.globalCompositeOperation = 'destination-in';
    const rg = g.createRadialGradient(w / 2, h / 2, w * 0.2, w / 2, h / 2, w / 2);
    rg.addColorStop(0, '#000'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, w, h);
  });
  const floor = new T.Mesh(new T.PlaneGeometry(span, span), new T.MeshBasicMaterial({ map: floorTex, transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(center.x, min[1] - 1.6, center.z);
  scene.add(floor);

  const pill = (text, dot) => canvasTex(256, 96, (g, w, h) => {
    g.fillStyle = 'rgba(8,20,34,.9)'; g.strokeStyle = dot; g.lineWidth = 4;
    g.beginPath(); g.roundRect(6, 14, w - 12, h - 28, 30); g.fill(); g.stroke();
    g.fillStyle = dot; g.beginPath(); g.arc(46, h / 2, 13, 0, 7); g.fill();
    g.fillStyle = '#e4eef8'; g.font = '700 46px "Chakra Petch", sans-serif'; g.textBaseline = 'middle';
    g.fillText(text, 74, h / 2 + 2);
  });
  const glyph = text => canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.font = '700 104px "Chakra Petch", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 6);
  });
  // Direção de cada face no mundo (o layout fala no referencial do fluxo; Andares é girado).
  const faceDir = side => { const n = NRM3[side]; return lay.mode === 'floors' ? new T.Vector3(n[2], n[1], -n[0]) : new T.Vector3(...n); };
  // Cor da esteira: a da entrada enquanto é de uma entrada só; misturada, a da saída para onde segue.
  const beltColor = b => (b.kind === 'loop' ? hex('var(--ink-dim)') : b.inp >= 0 ? inColor(b.inp) : b.out >= 0 ? inColor(b.out) : hex('var(--ink)'));

  const objs = [];
  const track = (root, step, kind, id) => {
    const mats = [], meshes = [];
    root.traverse(o => {
      if (o.isMesh && !o.userData.noPick) meshes.push(o);
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
        if (!m.userData.base) m.userData.base = { color: m.color?.clone(), emissive: m.emissive?.clone(), ei: m.emissiveIntensity, op: m.opacity, tr: m.transparent, dw: m.depthWrite };
        if (!mats.includes(m)) mats.push(m);
      });
    });
    const obj = { root, step, kind, id, mats, meshes };
    root.traverse(o => { o.userData.obj = obj; });
    scene.add(root);
    objs.push(obj);
    return obj;
  };

  // Peças.
  const H = L3D.half;
  const bodyG = new RoundedBoxGeometry(H.s[0] * 2, H.s[1] * 2, H.s[2] * 2, 3, 0.06);
  const plateG = new RoundedBoxGeometry(H.in[0] * 2, H.in[1] * 2, H.in[2] * 2, 2, 0.06);
  const ins = lay.pieces.filter(p => p.t === 'in'), outs = lay.pieces.filter(p => p.t === 'out');
  // Topo: uma seta por porta usada, na cor da esteira; saída do centro para fora, entrada de fora para o centro.
  // Canvas: direita = +x do mundo, baixo = +z do mundo (o plano é deitado com -π/2 em x).
  const topIcon = (p, base) => canvasTex(256, 256, (g, w) => {
    g.fillStyle = base; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, w - 6);
    const c = w / 2;
    const arrow = (side, out, color) => {
      const dir = faceDir(side), from = out ? 26 : 108, to = out ? 108 : 26;
      const x0 = c + dir.x * from, y0 = c + dir.z * from, x1 = c + dir.x * to, y1 = c + dir.z * to, a = Math.atan2(y1 - y0, x1 - x0);
      const stroke = (col, wd) => {
        g.strokeStyle = col; g.lineWidth = wd; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1 - Math.cos(a) * 10, y1 - Math.sin(a) * 10); g.stroke();
        g.beginPath(); g.moveTo(x1 - Math.cos(a - 0.55) * 34, y1 - Math.sin(a - 0.55) * 34); g.lineTo(x1, y1); g.lineTo(x1 - Math.cos(a + 0.55) * 34, y1 - Math.sin(a + 0.55) * 34); g.stroke();
      };
      stroke('#04101c', 30); stroke(color, 16);
    };
    lay.belts.forEach(b => { if (b.a === p.id) arrow(b.fromSide, true, beltColor(b)); if (b.b === p.id) arrow(b.toSide, false, beltColor(b)); });
    g.fillStyle = '#04101c'; g.beginPath(); g.arc(c, c, 16, 0, 7); g.fill();
  });
  const Z = new T.Vector3(0, 0, 1);
  for (const p of lay.pieces) {
    const g = new T.Group();
    g.position.set(...p.pos);
    if (p.t === 's' || p.t === 'm') {
      const isS = p.t === 's', base = isS ? SPLITTER_3D : MERGER_3D;
      g.add(new T.Mesh(bodyG, new T.MeshLambertMaterial({ color: base })));
      const top = new T.Mesh(new T.PlaneGeometry(H.s[0] * 2, H.s[2] * 2), new T.MeshBasicMaterial({ map: topIcon(p, isS ? '#ffb877' : '#7ee5d9') }));
      top.rotation.x = -Math.PI / 2;
      top.position.y = H.s[1] + 0.005;
      g.add(top);
      const n = isS ? p.ways : lay.belts.filter(b => b.b === p.id).length;
      for (const side of ['front', 'right']) {
        const dir = faceDir(side), m = new T.Mesh(new T.PlaneGeometry(2.4, 1.6), new T.MeshBasicMaterial({ map: glyph(isS ? `1→${n}` : `${n}→1`), transparent: true, depthWrite: false }));
        m.quaternion.setFromUnitVectors(Z, dir);
        m.position.copy(dir.clone().multiplyScalar(H.s[0] + 0.005));
        m.userData.noPick = true;
        g.add(m);
      }
    } else if (p.t === 'sink') {
      g.add(new T.Mesh(bodyG, new T.MeshLambertMaterial({ color: hex('var(--sink)') })));
    } else {
      const isIn = p.t === 'in', i = isIn ? ins.indexOf(p) : outs.indexOf(p);
      const color = inColor(isIn ? p.inp ?? i : i);
      g.add(new T.Mesh(plateG, new T.MeshLambertMaterial({ color })));
      const sp = new T.Sprite(new T.SpriteMaterial({ map: pill(isIn ? labels.ins[i] : labels.outs[i], color), depthTest: false, transparent: true }));
      sp.scale.set(4.4, 1.65, 1);
      sp.position.y = 1.6;
      sp.renderOrder = 5;
      g.add(sp);
    }
    track(g, p.step, 'piece', p.id);
  }

  // Esteiras: tubo + contorno (lado de dentro de um tubo maior) + gola, seta e anel nas portas.
  const polyline = pts => {
    const segs = [];
    let tot = 0;
    for (let k = 1; k < pts.length; k++) {
      const a = new T.Vector3(...pts[k - 1]), b = new T.Vector3(...pts[k]), len = a.distanceTo(b);
      if (len < 1e-6) continue;
      segs.push({ a, len, s0: tot, dir: b.clone().sub(a).normalize() });
      tot += len;
    }
    const at = (s, out) => { const g = segs.find(x => s <= x.s0 + x.len) || segs[segs.length - 1]; return out.copy(g.a).addScaledVector(g.dir, s - g.s0); };
    return { tot, at };
  };
  const roundedPath = (pts, r) => {
    const P = pts.map(p => new T.Vector3(...p)).filter((p, i, a) => i === 0 || p.distanceTo(a[i - 1]) > 1e-6);
    const path = new T.CurvePath();
    let from = P[0];
    for (let i = 1; i < P.length - 1; i++) {
      const a = P[i - 1], b = P[i], c = P[i + 1], rr = Math.min(r, a.distanceTo(b) / 2, b.distanceTo(c) / 2);
      const p1 = b.clone().addScaledVector(a.clone().sub(b).normalize(), rr), p2 = b.clone().addScaledVector(c.clone().sub(b).normalize(), rr);
      if (from.distanceTo(p1) > 1e-6) path.add(new T.LineCurve3(from.clone(), p1));
      path.add(new T.QuadraticBezierCurve3(p1, b.clone(), p2));
      from = p2;
    }
    path.add(new T.LineCurve3(from.clone(), P[P.length - 1]));
    return path;
  };
  const coneG = new T.ConeGeometry(0.5, 1.0, 14), ringG = new T.TorusGeometry(0.46, 0.12, 8, 20), collarG = new T.BoxGeometry(1.0, 1.0, 0.16);
  const flows = [];
  lay.belts.forEach((b, bi) => {
    const color = beltColor(b), g = new T.Group();
    const line = polyline(b.pts), path = roundedPath(b.pts, 0.6), segs = Math.max(8, Math.round(line.tot * 2.5));
    g.add(new T.Mesh(new T.TubeGeometry(path, segs, 0.2, 8, false), new T.MeshBasicMaterial({ color })));
    g.add(new T.Mesh(new T.TubeGeometry(path, segs, 0.36, 8, false), new T.MeshBasicMaterial({ color: 0x03080f, side: T.BackSide })));
    const port = (q, side) => { const dir = faceDir(side), col = new T.Mesh(collarG, new T.MeshBasicMaterial({ color: 0x03080f })); col.position.set(...q); col.quaternion.setFromUnitVectors(Z, dir); col.userData.noPick = true; g.add(col); return dir; };
    const out = port(b.pts[0], b.fromSide), inn = port(b.pts[b.pts.length - 1], b.toSide);
    const cone = new T.Mesh(coneG, new T.MeshBasicMaterial({ color }));
    cone.position.set(...b.pts[0]).addScaledVector(out, 0.75);
    cone.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), out);
    const ring = new T.Mesh(ringG, new T.MeshBasicMaterial({ color }));
    ring.position.set(...b.pts[b.pts.length - 1]).addScaledVector(inn, 0.5);
    ring.quaternion.setFromUnitVectors(Z, inn);
    g.add(cone, ring);
    const ob = track(g, b.step, 'belt', bi);
    flows.push({ line, color: new T.Color(color), bi, ob, off: (bi * 0.37) % 2.2 });
  });

  // Pontos de luz nas esteiras: uma InstancedMesh para todas.
  let total = 0;
  for (const f of flows) { f.n = Math.max(1, Math.floor(f.line.tot / 2.2)); f.first = total; total += f.n; }
  const items = new T.InstancedMesh(new T.SphereGeometry(0.24, 10, 8), new T.MeshBasicMaterial({ color: 0xffffff }), total);
  const white = new T.Color(0xffffff);
  for (const f of flows) for (let k = 0; k < f.n; k++) items.setColorAt(f.first + k, f.color.clone().lerp(white, 0.6));
  scene.add(items);

  const camera = new T.PerspectiveCamera(45, 1, 0.5, 2000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reduce;
  controls.maxPolarAngle = Math.PI * 0.495;
  const recenter = () => {
    const dist = fitDistance(lay.bounds, camera.fov, camera.aspect);
    camera.position.copy(center).add(new T.Vector3(0.75, 0.75, 1.1).normalize().multiplyScalar(dist));
    controls.target.copy(center);
    controls.update();
    draw();
  };

  const M4 = new T.Matrix4(), V = new T.Vector3(), Q = new T.Quaternion(), ONE = new T.Vector3(1, 1, 1), ZERO = new T.Vector3();
  // Estado de cada objeto: passo atual (holograma pulsando na própria cor), apagado (fora do foco) ou normal.
  const WHITE = new T.Color(0xffffff);
  let cur = 0, K = 0, lit = null, clock = 0;
  const apply = () => {
    const done = cur >= K, k = reduce ? 0.5 : 0.5 - 0.5 * Math.cos(clock * Math.PI * 2 / 1.15);
    for (const o of objs) {
      o.root.visible = done || o.step <= cur;
      const now = !done && o.step === cur;
      const dim = lit && !(o.kind === 'piece' ? lit.pieces.has(o.id) : lit.belts.has(o.id));
      const state = now ? 'now' : dim ? 'dim' : 'base';
      if (state === 'base' && o.st === 'base') continue;
      for (const m of o.mats) {
        const b = m.userData.base;
        if (state === 'now') {
          m.transparent = true; m.opacity = b.op * (dim ? 0.1 : 0.3 + 0.45 * k); m.depthWrite = false;
          if (m.emissive) { m.emissive.copy(b.color || WHITE); m.emissiveIntensity = 0.15 + k * 0.45; } else if (b.color) m.color.copy(b.color).lerp(WHITE, 0.1 + k * 0.3);
        } else {
          m.transparent = dim || b.tr; m.opacity = dim ? b.op * 0.1 : b.op; m.depthWrite = dim ? false : b.dw;
          if (m.emissive) { m.emissive.copy(b.emissive); m.emissiveIntensity = b.ei; } else if (b.color) m.color.copy(b.color);
        }
        if (o.st !== state) m.needsUpdate = true;
      }
      o.st = state;
    }
    for (const f of flows) {
      const on = f.ob.root.visible && !(lit && !lit.belts.has(f.bi));
      for (let i = 0; i < f.n; i++) {
        if (!on) M4.compose(V.set(0, -1e4, 0), Q, ZERO);
        else { f.line.at(((f.off + (reduce ? 0 : clock * 3.4) + i * f.line.tot / f.n) % f.line.tot), V); M4.compose(V, Q, ONE); }
        items.setMatrixAt(f.first + i, M4);
      }
    }
    items.instanceMatrix.needsUpdate = true;
  };
  const setStep = (c, k) => { cur = c; K = k; apply(); draw(); };
  // Foco: o fixado (clique ou botão Seguir) vale até soltar; sem fixado, o mouse em cima acende na hora.
  let pinned = null;
  const show = f => { lit = f; apply(); draw(); };
  const focus = id => { pinned = id ?? null; show(pinned === null ? null : focus3d(lay, pinned)); };
  const ray = new T.Raycaster(), ptr = new T.Vector2();
  const pickAt = e => {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const meshes = objs.filter(o => o.root.visible).flatMap(o => o.meshes);
    return ray.intersectObjects(meshes, false)[0]?.object.userData.obj || null;
  };
  const litOf = o => (o.kind === 'piece' ? focus3d(lay, o.id) : { pieces: new Set([lay.belts[o.id].a, lay.belts[o.id].b]), belts: new Set([o.id]) });
  const el = renderer.domElement;
  const tap = tapGesture();
  el.addEventListener('pointerdown', e => tap.down(e.pointerId, e.clientX, e.clientY));
  el.addEventListener('pointercancel', e => tap.cancel(e.pointerId));
  el.addEventListener('pointermove', e => {
    if (pinned !== null || e.buttons || e.pointerType === 'touch') return;
    const o = pickAt(e);
    el.style.cursor = o ? 'pointer' : '';
    show(o ? litOf(o) : null);
  });
  el.addEventListener('pointerleave', () => { if (pinned === null) show(null); });
  // Clique ou toque sem arrastar fixa a peça (ou solta, no vazio); arrastar continua girando a câmera.
  el.addEventListener('pointerup', e => {
    if (!tap.up(e.pointerId, e.clientX, e.clientY)) return;
    const o = pickAt(e), id = o ? (o.kind === 'piece' ? o.id : lay.belts[o.id].a) : null;
    focus(id === pinned ? null : id);
    if (opts.onFocus) opts.onFocus(pinned);
  });

  const size = () => {
    const w = stage.clientWidth || 600, h = stage.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    draw();
  };
  let raf = 0, last = 0, visible = true, alive = true;
  function draw() { if (alive) renderer.render(scene, camera); }
  const loop = now => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000 || 0);
    last = now;
    if (!visible) return;
    clock += dt;
    apply();
    controls.update();
    draw();
  };
  const ro = new ResizeObserver(size);
  ro.observe(stage);
  const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; });
  io.observe(stage);
  if (reduce) controls.addEventListener('change', draw);
  else raf = requestAnimationFrame(loop);
  size();
  recenter();

  const dispose = () => {
    alive = false;
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    controls.dispose();
    scene.traverse(o => {
      o.geometry?.dispose();
      (Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).forEach(m => { m.map?.dispose(); m.dispose(); });
    });
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
  return { setStep, recenter, dispose, focus };
}

// Montagem da planta, guardada por formato: o roteamento das esteiras pode levar segundos nos balancers grandes.
