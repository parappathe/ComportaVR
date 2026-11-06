// Adversário do outro lado da mesa: corpo, cabeça que olha, olhos que piscam, boca que ri ou
// entristece, braços que comemoram, balão de "pensando" e um enfeite por personalidade.
import * as THREE from '../vendor/three/three.module.js';

// opts.headY: altura da cabeça; opts.build(headG, group, mats) devolve { careful, risky, master }
export function makeAvatar(opts = {}) {
  const headY = opts.headY ?? 1.42;
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: opts.skin ?? 0xe0b08a });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x6fa8dc });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.62, 18), shirt);
  body.position.y = headY - 0.5; group.add(body);
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.1, 0.5, 0.8), shirt);
  shoulders.position.y = headY - 0.21; group.add(shoulders);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, headY - 0.78, 12), new THREE.MeshLambertMaterial({ color: 0x3a3a48 }));
  legs.position.y = (headY - 0.78) / 2; group.add(legs);
  const headG = new THREE.Group();
  headG.position.y = headY; group.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 22, 14), skin);
  head.scale.set(1, 1.08, 1); headG.add(head);
  const eyeW = new THREE.MeshBasicMaterial({ color: 0xffffff }), eyeB = new THREE.MeshBasicMaterial({ color: 0x1a1008 });
  const eyes = [];
  const eyeGeo = new THREE.SphereGeometry(0.026, 12, 8), pupGeo = new THREE.SphereGeometry(0.013, 10, 6);
  for (const x of [-0.045, 0.045]) {
    const e = new THREE.Group();
    e.add(new THREE.Mesh(eyeGeo, eyeW));
    const p = new THREE.Mesh(pupGeo, eyeB); p.position.z = 0.018; e.add(p);
    e.position.set(x, 0.02, 0.11); headG.add(e); eyes.push(e);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 16, Math.PI), new THREE.MeshBasicMaterial({ color: 0x6a2a1a }));
  mouth.position.set(0, -0.055, 0.115); mouth.rotation.z = Math.PI; headG.add(mouth);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), skin); nose.position.set(0, -0.01, 0.13); headG.add(nose);
  const arms = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group();
    a.position.set(s * 0.21, headY - 0.26, 0.02);
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.3, 4, 10), shirt);
    up.position.set(0, -0.12, 0.13); up.rotation.x = Math.PI / 2.6; a.add(up);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), skin); h.position.set(-s * 0.05, -0.2, 0.32); a.add(h);
    a.rotation.z = s * 0.2;
    group.add(a); arms.push(a);
  }
  const parts = opts.build ? opts.build(headG, group, { skin, shirt }) : {};
  for (const k of Object.keys(parts)) headG.add(parts[k]);
  // balão de "pensando"
  const dotsMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
  const dots = [];
  for (let k = 0; k < 3; k++) { const d = new THREE.Mesh(new THREE.SphereGeometry(0.018 + k * 0.006, 10, 8), dotsMat); d.position.set(0.16 + k * 0.05, 0.16 + k * 0.05, 0); headG.add(d); dots.push(d); }

  const state = { mood: 0, moodT: 0, thinking: false, blink: 2 };
  function setStyle(style, color) {
    for (const k of Object.keys(parts)) parts[k].visible = k === style;
    shirt.color.set(color);
  }
  function react(mood) { state.mood = mood; state.moodT = 1.8; }   // +1 feliz, -1 triste
  const _l = new THREE.Vector3();
  function update(dt, time, lookAt) {
    state.blink -= dt;
    const blink = state.blink < 0.12;
    if (state.blink < 0) state.blink = 2 + Math.random() * 3;
    for (const e of eyes) e.scale.y = blink ? 0.15 : 1;
    state.moodT = Math.max(0, state.moodT - dt);
    const m = state.moodT > 0 ? state.mood : 0;
    if (lookAt) {
      const local = group.worldToLocal(_l.copy(lookAt)).sub(headG.position);
      const yaw = Math.atan2(local.x, local.z), pitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
      headG.rotation.y += (THREE.MathUtils.clamp(yaw, -0.8, 0.8) - headG.rotation.y) * Math.min(1, dt * 4);
      headG.rotation.x += (THREE.MathUtils.clamp(-pitch, -0.6, 0.6) - headG.rotation.x) * Math.min(1, dt * 4);
    }
    headG.rotation.z = state.thinking ? Math.sin(time * 1.5) * 0.12 : m < 0 ? Math.sin(time * 6) * 0.1 : 0;
    headG.position.y = headY + Math.sin(time * 1.7) * 0.006 + (m > 0 ? Math.abs(Math.sin(time * 9)) * 0.04 : 0) - (m < 0 ? 0.03 : 0);
    mouth.rotation.z = m < 0 ? 0 : Math.PI;
    mouth.position.y = m < 0 ? -0.075 : -0.055;
    arms.forEach((a, k) => {
      const s = k ? 1 : -1;
      a.rotation.x = m > 0 ? -1.2 - Math.sin(time * 9) * 0.3 : state.thinking && k ? -0.5 : 0;
      a.rotation.z = s * (m > 0 ? 0.5 : 0.2);
    });
    dots.forEach((d, k) => { d.visible = state.thinking; d.position.y = 0.16 + k * 0.05 + Math.sin(time * 4 + k) * 0.01; });
  }
  return { group, setStyle, react, update, state, headG };
}
