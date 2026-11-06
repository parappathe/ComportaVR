// Fumaça do main.js: carrega o jogo inteiro no Node com um navegador de mentira (sem WebGL, sem som)
// e confere que menu, partida (com o robô), clique do PC com prévia e desafios funcionam, pelo
// mesmo caminho que o jogo usa (botões do painel, funções que carregam partida e desafio).
import * as nodeModule from 'node:module';

// ---- navegador de mentira ----
function fakeCtx() {
  const fn = () => proxy;
  const proxy = new Proxy(fn, {
    get(_, k) {
      if (k === 'measureText') return (t) => ({ width: String(t).length * 12 });
      if (k === 'canvas') return null;
      return fn;
    },
    set() { return true; },
    apply() { return proxy; },
  });
  return proxy;
}
function fakeElement(tag = 'div') {
  const listeners = {};
  return {
    tagName: tag.toUpperCase(), style: {}, dataset: {}, children: [], textContent: '', innerHTML: '', width: 300, height: 150,
    listeners,
    addEventListener(t, f) { (listeners[t] ||= []).push(f); },
    removeEventListener() {},
    appendChild(c) { this.children.push(c); return c; },
    getContext() { return fakeCtx(); },
    setPointerCapture() {}, releasePointerCapture() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    dispatch(t, e) { for (const f of listeners[t] || []) f(e); },
  };
}
function installDom() {
  const els = {};
  const winListeners = {};
  const store = new Map();
  const doc = {
    createElement: (t) => fakeElement(t),
    createElementNS: (_, t) => fakeElement(t),
    getElementById: (id) => (els[id] ||= fakeElement('div')),
    body: fakeElement('body'),
    addEventListener() {},
  };
  const win = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, isSecureContext: false,
    addEventListener(t, f) { (winListeners[t] ||= []).push(f); },
    removeEventListener() {},
    dispatch(t, e) { for (const f of winListeners[t] || []) f(e); },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.self = win;
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-teste' }, configurable: true, writable: true });
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame = win.requestAnimationFrame;
  return { els, win, store };
}

// Troca só o WebGLRenderer do Three.js por um de mentira (o resto do Three.js é o de verdade).
function installThreeStub() {
  const stub = new URL('./three-stub.js', import.meta.url).href;
  const resolve = (spec, ctx, next) => {
    if (spec.endsWith('vendor/three/three.module.js') && !String(ctx.parentURL || '').endsWith('three-stub.js')) return { url: stub, shortCircuit: true };
    return next(spec, ctx);
  };
  if (nodeModule.registerHooks) nodeModule.registerHooks({ resolve });
  else throw new Error('Node sem module.registerHooks (precisa do Node 22.15 ou mais novo)');
}

export async function smoke() {
  const out = [];
  const ok = (c, m) => out.push([!!c, m]);
  const { els, win, store } = installDom();
  installThreeStub();
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => errors.push(a.join(' '));
  try {
    await import('../js/main.js');
    const dev = window.dev;
    const R = await import('../js/rules.js');
    ok(dev && typeof dev.advance === 'function', 'main.js carregou e criou window.dev');
    let s = dev.advance(0.5);
    ok(s.tela === 'menu' && s.painel, 'abre no menu principal');
    ok(els.vr.textContent.includes('VR'), `botão de VR avisa que não tem VR aqui ("${els.vr.textContent}")`);
    ok(dev.press('Partida contra o computador') && dev.press('Seu Moleiro'), 'partida pelo menu: Seu Moleiro');
    s = dev.state();
    ok(s.tela === 'play' && s.adversario === 'Seu Moleiro', 'partida começou');
    const waitTurn = () => { for (let i = 0; i < 80 && !(dev.state().fase === 'turn'); i++) dev.advance(0.25); return dev.advance(0.1); };
    s = waitTurn();
    ok(s.fase === 'turn' && s.vez === 'você', 'chega a sua vez');
    const canvasEl = window.comporta.renderer.domElement;
    const st0 = window.comporta.match.round;
    const lane = 2;
    const expect = R.preview(st0, lane);
    const p = dev.laneScreen(lane);
    canvasEl.dispatch('pointermove', { clientX: p.x, clientY: p.y });
    s = dev.advance(0.05);
    const v = expect.value;
    ok(s.previa && s.previa.startsWith(`Funil 3 → caixa ${v > 0 ? '+' : ''}${v}`) && s.caminho, `passar o mouse na canaleta mostra o caminho e a caixa ("${s.previa}")`);
    canvasEl.dispatch('pointerdown', { clientX: p.x, clientY: p.y, button: 0 });
    s = dev.state();
    ok(s.fase === 'anim' && s.bolinhas[0] === st0.balls[0] - 1, 'clicar solta a bolinha');
    for (let i = 0; i < 40 && dev.state().animando; i++) dev.advance(0.1);
    const st1 = window.comporta.match.round;
    ok(st1.bins[expect.bin].includes(0) && st1.score[0] === st0.score[0] + v, `bolinha caiu na caixa ${expect.bin + 1} e pontuou ${v}`);
    ok(dev.check().length === 0, `tela bate com as regras (${dev.check().join('; ')})`);
    // tecla 5 também solta
    s = waitTurn();
    const st2 = window.comporta.match.round;
    if (!st2.over && st2.turn === 0) {
      win.dispatch('keydown', { key: '5' }); win.dispatch('keyup', { key: '5' });
      ok(dev.state().fase === 'anim', 'tecla 5 solta no funil 5');
    }
    dev.autoplay = true;
    let guard = 0;
    const bad = [];
    while (!dev.state().vencedor && guard++ < 1500) { dev.advance(0.5); bad.push(...dev.check()); }
    s = dev.state();
    ok(s.vencedor, `partida terminou sozinha (${s.total?.join(' x ')}, vencedor: ${s.vencedor})`);
    ok(bad.length === 0, `tela sempre bateu com as regras (${bad.slice(0, 3).join('; ')})`);
    const m = window.comporta.match;
    ok(m.results.length === 2 && m.total(0) + m.total(1) > 0, 'jogou as 2 rodadas');
    ok(JSON.parse(store.get('comportavr.v1')).games[1] === 1, 'resultado salvo no localStorage');
    ok(dev.press('Menu principal') && dev.press('Desafios') && dev.press('1 '), 'abre o desafio 1 pelo menu');
    const stars = [];
    for (let n = 1; n <= 10; n++) {
      let k = 0;
      while (dev.state().estrelas == null && k++ < 200) dev.advance(0.5);
      stars.push(dev.state().estrelas);
      if (n < 10) dev.press('Próximo');
    }
    ok(stars.every(x => x === 3), `robô tira 3 estrelas nos 10 desafios dentro do jogo (${stars.join(' ')})`);
    ok(Object.keys(JSON.parse(store.get('comportavr.v1')).ch).length === 10, 'estrelas dos desafios salvas');
    dev.autoplay = false;
    dev.startMatch(3);
    dev.advance(0.2);
    s = dev.forceWin();
    ok(s.fase === 'roundEnd' && s.pontos[0] > s.pontos[1], 'dev.forceWin fecha a rodada com vitória sua');
    dev.press('Próxima rodada');
    ok(dev.state().rodada === 2, 'segunda rodada pelo botão');
    win.dispatch('keydown', { key: 'Escape' });
    ok(dev.state().tela === 'paused', 'Esc pausa');
    win.dispatch('keydown', { key: 'Escape' });
    ok(dev.state().tela === 'play', 'Esc de novo continua');
    const loop = window.comporta.renderer._loop;
    for (let i = 0; i < 5; i++) loop?.(performance.now() + i * 16);
    ok(typeof loop === 'function', 'laço de animação ligado');
  } finally {
    console.error = origErr;
  }
  ok(errors.length === 0, `sem erros no console (${errors.slice(0, 2).join(' | ')})`);
  return out;
}
