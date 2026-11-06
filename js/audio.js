// Sons sintetizados na hora (sem arquivos): bolinha batendo nas comportas, comporta virando, caixa
// pontuando, riacho e roda d'água lá fora, passarinhos, cliques e fanfarras.
// Só liga depois de um clique ou da entrada no VR. Os testes nunca chamam unlock (não toca nada).
export class Sfx {
  constructor() { this.ctx = null; this.on = true; }

  unlock() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.on ? 0.9 : 0;
      this.master.connect(this.ctx.destination);
      this.white = this.makeNoise(3);
      this.birdT = 2;
      // riacho: chiado grave contínuo
      const src = this.ctx.createBufferSource(); src.buffer = this.white; src.loop = true;
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 600;
      const g = this.ctx.createGain(); g.gain.value = 0.05;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setOn(v) {
    this.on = v;
    if (this.master) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05);
  }

  makeNoise(sec) {
    const c = this.ctx;
    const buf = c.createBuffer(1, Math.ceil(c.sampleRate * sec), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
    return buf;
  }

  tone(freq, dur, { type = 'sine', vol = 0.2, at = 0, slide = 0, attack = 0.004 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, { vol = 0.1, freq = 1200, q = 1, at = 0, type = 'bandpass', attack = 0, sweep = 0 } = {}) {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime + at;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.white;
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t + dur);
    g.gain.setValueAtTime(attack ? 0.0001 : vol, t);
    if (attack) g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random() * 2); src.stop(t + dur + 0.05);
  }

  // Bolinha batendo na comporta (madeira) e a comporta virando
  tok(at = 0) { this.noise(0.02, { vol: 0.25, freq: 2200, q: 2, at }); this.tone(420, 0.06, { vol: 0.1, type: 'triangle', slide: 0.8, at }); }
  flip(at = 0) { this.tone(260, 0.07, { vol: 0.08, type: 'square', slide: 0.6, at }); }
  // Caiu na caixa: baque e, se pontuou, um "plim" (mais alto quanto mais pontos)
  land(value = 1, at = 0) {
    this.tone(160, 0.15, { vol: 0.22, type: 'sine', slide: 0.6, at });
    this.noise(0.05, { vol: 0.12, freq: 700, q: 1, type: 'lowpass', at });
    if (value > 0) this.tone(660 + value * 60, 0.3, { vol: 0.09, type: 'triangle', at: at + 0.05 });
    else if (value < 0) this.tone(220, 0.4, { vol: 0.09, type: 'sawtooth', slide: 0.5, at: at + 0.05 });
  }
  drop() { this.tone(900, 0.05, { vol: 0.06, type: 'sine', slide: 0.7 }); }
  pick() { this.tone(700, 0.05, { vol: 0.08, type: 'triangle', slide: 1.4 }); }
  click() { this.tone(880, 0.05, { vol: 0.07, type: 'square' }); }
  good() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.25, { vol: 0.1, type: 'triangle', at: i * 0.08 })); }
  bad() { this.tone(330, 0.5, { vol: 0.1, type: 'triangle', slide: 0.7 }); this.tone(262, 0.6, { vol: 0.06, type: 'sine', slide: 0.7, at: 0.12 }); }
  fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, i === 5 ? 0.7 : 0.18, { vol: 0.12, type: 'triangle', at: i * 0.12 })); }
  star(n) { this.tone(784 * (1 + n * 0.26), 0.35, { vol: 0.12, type: 'triangle' }); }

  // Passarinhos lá fora, de vez em quando
  updateAmbience(dt) {
    if (!this.ctx) return;
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 3 + Math.random() * 6;
      const base = 2400 + Math.random() * 1400, n = 2 + ((Math.random() * 3) | 0);
      for (let k = 0; k < n; k++) this.tone(base * (1 + (k % 2) * 0.12), 0.08, { vol: 0.018, type: 'sine', slide: 1.25, at: k * 0.11 });
    }
  }
}
