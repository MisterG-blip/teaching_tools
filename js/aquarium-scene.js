// ============================================================================
// MODULE: Aquarium-Szene
// PURPOSE: Simulation und Zeichnung des Klassen-Aquariums. Enthält KEINEN
//          DOM- oder Mikrofon-Zugriff: aquarium.js füttert die Szene nur mit
//          Lautstärke-Werten und ruft draw() mit einem Canvas-Kontext auf.
//
// Alle Koordinaten sind "Weltkoordinaten" (1600 x 900). Der Aufrufer skaliert
// den Kontext auf die tatsächliche Canvas-Größe.
//
// Spielregeln:
//   - Ist es leise, schwimmen die Fische entspannt.
//   - Ist es länger als GRACE_SECONDS zu laut, kommt der Hai und frisst
//     einen Fisch.
//   - Wird es während der Jagd wieder leise (CALM_ABORT_SECONDS), bricht der
//     Hai ab und der Fisch ist gerettet.
//   - Bei anhaltender Ruhe schlüpft nach einer Weile ein neuer Fisch.
// ============================================================================

import { drawSpecialLeague, SPECIES, TIER_SCALE } from './aquarium-fish.js';

export const WORLD_W = 1600;
export const WORLD_H = 900;

const SAND_H = 120;
const SURFACE_Y = 44;
const GRACE_SECONDS = 1.2;
const CALM_ABORT_SECONDS = 1.0;
const HATCH_AFTER_QUIET_SECONDS = 20;
const COMEBACK_SECONDS = 180;   // so lange Ruhe nach einem gefressenen Fisch = Comeback
const SHARK_LENGTH = 460;
const SHARK_SPEED = 320;        // Anflug: langsam genug, dass die Klasse noch reagieren kann
const SHARK_LUNGE_SPEED = 820;  // Endspurt kurz vor dem Fisch
const SHARK_LUNGE_DISTANCE = 260;
const FISH_HUES = [8, 28, 48, 165, 200, 265, 320, 345];

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (cur, target, step) => cur + clamp(target - cur, -step, step);

function newStats() {
  return {
    eaten: 0,
    quietStreak: 0, bestQuiet: 0, quietTotal: 0,
    sharkFree: 0, bestSharkFree: 0,     // Zeit ohne gefressenen Fisch
    rescued: 0, comebacks: 0, pondFull: 0
  };
}

export function createTank() {
  const tank = {
    fish: [],
    specials: [],      // besondere Fische aus Pokalen: zählen nicht, der Hai ignoriert sie
    showSpecials: true,  // Bonus-Fische im Becken? (aus = sie schwimmen hinaus)
    showcase: false,     // Schau-Modus: nur Bonus-Fische, kein Hai, keine normalen Fische
    maxFish: 8,
    respawn: true,
    tension: 0,        // 0 = entspannt, 1 = kurz vor "zu laut" (für Wasserfarbe und Hai-Flosse)
    loudT: 0,
    calmT: 0,
    quietT: 0,
    cooldown: 0,
    shake: 0,
    time: 0,
    pendingHunt: false,
    stats: newStats(),
    lostFish: false,   // wurde seit dem letzten vollen Becken ein Fisch gefressen?
    comeback: { active: false, quiet: 0 },
    // Callbacks (ohne Argumente), von aquarium.js gesetzt:
    onEaten: null,     // ein Fisch wurde gefressen
    onRescued: null,   // der Hai hat abgebrochen, weil die Klasse leise wurde
    onComeback: null,  // 3 Minuten Ruhe nach einem gefressenen Fisch
    onPondFull: null,  // alle Fische sind nach einem Verlust wieder da
    shark: { state: 'away', x: -SHARK_LENGTH, y: 300, dir: 1, target: null, mouth: 0, leaveDir: 1, mouthHold: 0, forced: false },
    lurk: { x: 400, dir: 1 },
    bubbles: [],
    particles: [],
    texts: [],
    plants: [],
    rocks: []
  };

  // Dekoration, die sich nicht ändert
  const plantXs = [90, 210, 330, 700, 1060, 1290, 1420, 1530];
  plantXs.forEach((x, i) => {
    tank.plants.push({ x: x + rand(-25, 25), h: rand(130, 250), seed: rand(0, 6), hue: rand(100, 150), w: rand(10, 16), i });
  });
  tank.rocks.push({ x: 520, w: 120, h: 62 }, { x: 600, w: 70, h: 40 }, { x: 1180, w: 140, h: 70 }, { x: 1230, w: 80, h: 44 });

  // ---------- Fische ----------

  function makeFish(spawnEffect) {
    const f = {
      x: rand(150, WORLD_W - 150),
      y: rand(150, WORLD_H - SAND_H - 90),
      vy: 0,
      dir: Math.random() < 0.5 ? -1 : 1,
      baseSpeed: rand(55, 110),
      size: rand(34, 52),
      hue: FISH_HUES[Math.floor(Math.random() * FISH_HUES.length)],
      phase: rand(0, 6),
      ty: 0,
      turnT: rand(2, 6),
      panic: 0,
      spawnT: spawnEffect ? 0 : 1
    };
    f.ty = f.y;
    if (tank.showcase) f.away = true;   // normale Fische fehlen im Schau-Modus
    else if (spawnEffect) sparkle(f.x, f.y);
    return f;
  }

  function sparkle(x, y) {
    for (let i = 0; i < 9; i++) {
      const a = (Math.PI * 2 * i) / 9;
      tank.particles.push({ x, y, vx: Math.cos(a) * rand(60, 130), vy: Math.sin(a) * rand(60, 130) - 20, r: rand(4, 9), life: 0, max: rand(0.8, 1.3), kind: 'spark' });
    }
  }

  function chompBubbles(x, y) {
    for (let i = 0; i < 14; i++) {
      tank.particles.push({ x: x + rand(-20, 20), y: y + rand(-20, 20), vx: rand(-110, 110), vy: rand(-170, -30), r: rand(5, 15), life: 0, max: rand(0.9, 1.6), kind: 'bubble' });
    }
  }

  tank.reset = function reset(count) {
    tank.maxFish = count;
    tank.fish = [];
    for (let i = 0; i < count; i++) tank.fish.push(makeFish(false));
    tank.shark.state = 'away';
    tank.shark.target = null;
    tank.shark.x = -SHARK_LENGTH;
    tank.shark.mouth = 0;
    tank.loudT = 0; tank.calmT = 0; tank.quietT = 0; tank.cooldown = 0;
    tank.pendingHunt = false;
    tank.particles = []; tank.texts = [];
    tank.stats = newStats();
    tank.lostFish = false;
    tank.comeback = { active: false, quiet: 0 };
  };

  // Manuell: Hai ruft man auch ohne Mikrofon (z. B. zum Vorführen)
  tank.callShark = function callShark() {
    if (!tank.showcase && tank.shark.state === 'away' && tank.fish.length > 0) tank.pendingHunt = true;
  };

  // Ist dieser Fisch gerade erwünscht? Bonus-Fische: Schalter oder Schau-Modus. Normale: nicht im Schau-Modus.
  function wanted(f) {
    return f.special ? (tank.showSpecials || tank.showcase) : !tank.showcase;
  }

  tank.setShowSpecials = function setShowSpecials(on) { tank.showSpecials = !!on; };

  tank.setShowcase = function setShowcase(on) {
    tank.showcase = !!on;
    if (tank.showcase) {
      // Der Hai verschwindet sofort, normale Fische schwimmen hinaus
      const s = tank.shark;
      s.state = 'away'; s.target = null; s.x = -SHARK_LENGTH; s.mouth = 0; s.mouthHold = 0;
      tank.pendingHunt = false;
      tank.loudT = 0; tank.tension = 0;
    }
  };

  // Feier-Effekt (neuer Pokal / Rekord): Funken regnen durchs Becken
  tank.celebrate = function celebrate() {
    for (let i = 0; i < 34; i++) {
      tank.particles.push({
        x: rand(80, WORLD_W - 80), y: rand(SURFACE_Y + 10, 340),
        vx: rand(-40, 40), vy: rand(40, 150), r: rand(7, 14),
        life: -rand(0, 0.6), max: rand(1.4, 2.4), kind: 'spark'
      });
    }
  };

  /**
   * Besondere Fische aus Pokalen. list = [{ id, tier }], tier 1-3.
   * silent=true: ohne Funkeneffekt (z. B. beim Laden einer Gruppe).
   */
  tank.setSpecials = function setSpecials(list, silent) {
    // Ein Fisch pro Pokal UND Liga: Schlüssel "pokal:liga"
    const keyOf = e => e.id + ':' + (e.league || '');
    const wanted = new Map(list.map(e => [keyOf(e), e.tier]));
    tank.specials = tank.specials.filter(f => wanted.has(f.key));
    tank.specials.forEach(f => { f.tier = wanted.get(f.key); });
    list.forEach(e => {
      if (!SPECIES[e.id] || tank.specials.some(f => f.key === keyOf(e))) return;
      const visible = tank.showSpecials || tank.showcase;
      const f = makeFish(!silent && visible);
      f.special = true;
      f.away = !visible;
      f.key = keyOf(e);
      f.league = e.league || null;
      f.id = e.id;
      f.tier = e.tier;
      f.size = SPECIES[e.id].size;
      tank.specials.push(f);
    });
  };

  // ---------- Hai ----------

  function startHunt() {
    const s = tank.shark;
    if (tank.fish.length === 0) return;
    s.forced = tank.pendingHunt;   // per Knopf gerufen: kein Abbruch bei Stille
    s.target = tank.fish[Math.floor(Math.random() * tank.fish.length)];
    // Der Hai startet immer auf der Seite, die vom Ziel weiter weg liegt: so bleibt Zeit zum Retten
    s.dir = s.target.x < WORLD_W / 2 ? -1 : 1;
    s.x = s.dir > 0 ? -SHARK_LENGTH * 0.4 : WORLD_W + SHARK_LENGTH * 0.4;
    s.y = clamp(s.target.y, 120, WORLD_H - SAND_H - 80);
    s.mouth = 0.1;
    s.state = 'hunt';
    tank.pendingHunt = false;
    tank.calmT = 0;
  }

  function startLeave() {
    const s = tank.shark;
    s.state = 'leave';
    s.leaveDir = s.dir;
    s.target = null;
  }

  function eat(fish) {
    const s = tank.shark;
    tank.fish = tank.fish.filter(f => f !== fish);
    tank.stats.eaten++;
    tank.stats.sharkFree = 0;
    tank.lostFish = true;
    tank.comeback = { active: true, quiet: 0 };
    if (typeof tank.onEaten === 'function') tank.onEaten();
    tank.shake = 0.35;
    chompBubbles(fish.x, fish.y);
    tank.texts.push({ x: fish.x, y: fish.y - 40, text: 'NOM!', life: 0, max: 1.1 });
    s.mouthHold = 0.3;
    tank.cooldown = 2.0;
    tank.loudT = 0;
    startLeave();
  }

  function updateShark(dt) {
    const s = tank.shark;
    s.mouthHold = Math.max(0, s.mouthHold - dt);

    if (s.state === 'hunt') {
      const target = s.target;
      if (!target || !tank.fish.includes(target)) { startLeave(); return; }
      if (!s.forced && tank.calmT >= CALM_ABORT_SECONDS) {
        // Die Klasse war rechtzeitig leise: Fisch gerettet
        tank.stats.rescued++;
        if (typeof tank.onRescued === 'function') tank.onRescued();
        startLeave();
        return;
      }

      const dx = target.x - s.x;
      const dy = target.y - s.y;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = dist < SHARK_LUNGE_DISTANCE ? SHARK_LUNGE_SPEED : SHARK_SPEED;
      s.x += (dx / dist) * speed * dt;
      s.y = clamp(s.y + (dy / dist) * speed * 0.8 * dt, 100, WORLD_H - SAND_H - 60);
      if (Math.abs(dx) > 50) s.dir = dx > 0 ? 1 : -1;
      s.mouth = approach(s.mouth, dist < 340 ? 1 : 0.12, dt * 5);
      if (dist < 90) eat(target);
    } else if (s.state === 'leave') {
      s.x += s.leaveDir * 480 * dt;
      s.dir = s.leaveDir;
      s.mouth = approach(s.mouth, s.mouthHold > 0 ? 1 : 0, dt * 4);
      if (s.x < -SHARK_LENGTH || s.x > WORLD_W + SHARK_LENGTH) s.state = 'away';
    }
  }

  // ---------- Update ----------

  /**
   * @param {number} dt            Sekunden seit dem letzten Bild
   * @param {{level:number, threshold:number, micOn:boolean, paused:boolean}} opts
   */
  tank.update = function update(dt, opts) {
    const { level, threshold, micOn, paused } = opts;
    tank.time += dt;
    const listening = micOn && !paused;
    const loud = listening && level > threshold;

    const tensionTarget = listening ? clamp((level / Math.max(1, threshold) - 0.65) / 0.35, 0, 1) : 0;
    tank.tension += (tensionTarget - tank.tension) * Math.min(1, dt * 3);

    // Zeitzähler
    if (loud) { tank.loudT += dt; tank.calmT = 0; }
    else { tank.loudT = Math.max(0, tank.loudT - dt * 1.5); tank.calmT += dt; }
    tank.cooldown = Math.max(0, tank.cooldown - dt);

    if (listening && !loud) {
      tank.stats.quietStreak += dt;
      tank.stats.quietTotal += dt;
      tank.stats.bestQuiet = Math.max(tank.stats.bestQuiet, tank.stats.quietStreak);
      tank.quietT += dt;
    } else if (loud) {
      tank.stats.quietStreak = 0;
      tank.quietT = 0;
    }

    // Zeit ohne gefressenen Fisch (zählt auch bei Lärm, solange der Hai niemanden erwischt)
    if (listening) {
      tank.stats.sharkFree += dt;
      tank.stats.bestSharkFree = Math.max(tank.stats.bestSharkFree, tank.stats.sharkFree);
    }

    // Comeback: nach einem gefressenen Fisch 3 Minuten Ruhe am Stück
    if (tank.comeback.active && listening) {
      tank.comeback.quiet = loud ? 0 : tank.comeback.quiet + dt;
      if (tank.comeback.quiet >= COMEBACK_SECONDS) {
        tank.comeback.active = false;
        tank.stats.comebacks++;
        if (typeof tank.onComeback === 'function') tank.onComeback();
      }
    }

    // Neuer Fisch bei langer Ruhe
    if (!tank.showcase && tank.respawn && tank.fish.length < tank.maxFish && tank.quietT >= HATCH_AFTER_QUIET_SECONDS) {
      tank.fish.push(makeFish(true));
      tank.quietT = 0;
      // Voller Teich: nach einem Verlust sind wieder alle Fische da
      if (tank.fish.length >= tank.maxFish && tank.lostFish) {
        tank.lostFish = false;
        tank.stats.pondFull++;
        if (typeof tank.onPondFull === 'function') tank.onPondFull();
      }
    }

    // Hai losschicken
    const shark = tank.shark;
    if (!tank.showcase && shark.state === 'away' && tank.fish.length > 0 && tank.cooldown <= 0) {
      if (tank.pendingHunt || tank.loudT >= GRACE_SECONDS) startHunt();
    }
    updateShark(dt);

    // Fische
    const hunting = shark.state === 'hunt';
    tank.fish.concat(tank.specials).forEach(f => {
      // Rein- und Rausschwimmen (Bonus-Schalter, Schau-Modus)
      const show = wanted(f);
      if (f.away) {
        if (!show) return;                       // unsichtbar, ruht
        const fromLeft = Math.random() < 0.5;    // hereinschwimmen
        f.away = false; f.entering = true; f.leaving = false;
        f.x = fromLeft ? -90 : WORLD_W + 90;
        f.dir = fromLeft ? 1 : -1;
        f.spawnT = 1; f.panic = 0;
      } else if (!show && !f.leaving) {
        f.leaving = true; f.entering = false;
        f.dir = f.x < WORLD_W / 2 ? -1 : 1;      // zur nächsten Seite hinaus
      } else if (show && f.leaving) {
        f.leaving = false;
        if (f.x < 90 || f.x > WORLD_W - 90) { f.entering = true; f.dir = f.x < 90 ? 1 : -1; }
      }
      const moving = f.leaving || f.entering;

      f.spawnT = Math.min(1, f.spawnT + dt * 1.6);

      let panicTarget = 0;
      if (hunting && !moving) {
        const d = Math.hypot(f.x - shark.x, f.y - shark.y);
        if (d < 480) panicTarget = 1;
        if (panicTarget) {
          f.dir = f.x >= shark.x ? 1 : -1;
          f.ty = clamp(f.y + (f.y >= shark.y ? 80 : -80), 110, WORLD_H - SAND_H - 70);
        }
      }
      f.panic = approach(f.panic, panicTarget, dt * 4);

      f.turnT -= dt;
      if (f.turnT <= 0 && !f.panic && !moving) {
        f.turnT = rand(2.5, 7);
        f.ty = rand(110, WORLD_H - SAND_H - 80);
        if (Math.random() < 0.3) f.dir *= -1;
        f.baseSpeed = rand(55, 110);
      }
      // Der Kugelfisch flüchtet kaum, er bläht sich stattdessen auf
      const speed = f.baseSpeed * (1 + f.panic * (f.id === 'sharkfree' ? 0.2 : 2.2));
      f.x += f.dir * (f.leaving ? Math.max(speed, 170) : speed) * dt;
      if (f.leaving) {
        if (f.x < -100 || f.x > WORLD_W + 100) { f.away = true; f.leaving = false; return; }
      } else if (f.entering) {
        if (f.x >= 100 && f.x <= WORLD_W - 100) f.entering = false;
      } else {
        if (f.x < 90) { f.x = 90; f.dir = 1; }
        if (f.x > WORLD_W - 90) { f.x = WORLD_W - 90; f.dir = -1; }
      }

      const prevY = f.y;
      f.y += (f.ty - f.y) * Math.min(1, dt * (0.8 + f.panic * 2));
      f.vy = dt > 0 ? (f.y - prevY) / dt : 0;
      f.phase += dt * (5 + speed * 0.05);

      // Gold und Platin glitzern
      if (f.special && f.tier >= 3 && Math.random() < dt * 4) {
        tank.particles.push({
          x: f.x + rand(-24, 24), y: f.y + rand(-18, 18), vx: rand(-20, 20), vy: rand(-40, -10),
          r: rand(3, 6), life: 0, max: rand(0.6, 1.0), kind: 'spark'
        });
      }
    });

    // Flosse, die an der Oberfläche patrouilliert, wenn es unruhig wird
    tank.lurk.x += tank.lurk.dir * 90 * dt;
    if (tank.lurk.x > WORLD_W - 200) tank.lurk.dir = -1;
    if (tank.lurk.x < 200) tank.lurk.dir = 1;

    // Blasen
    if (Math.random() < dt * 1.4) {
      tank.bubbles.push({ x: rand(60, WORLD_W - 60), y: WORLD_H - SAND_H + 10, r: rand(4, 10), vy: rand(50, 95), wob: rand(0, 6) });
    }
    if (Math.random() < dt * 2.2) {
      tank.bubbles.push({ x: 1060 + rand(-6, 6), y: WORLD_H - SAND_H - 10, r: rand(3, 7), vy: rand(70, 110), wob: rand(0, 6) });
    }
    tank.bubbles.forEach(b => { b.y -= b.vy * dt; b.x += Math.sin(tank.time * 2 + b.wob) * 12 * dt; });
    tank.bubbles = tank.bubbles.filter(b => b.y > SURFACE_Y);

    tank.particles.forEach(p => {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - Math.min(1, dt * 1.5);
      if (p.kind === 'bubble') p.vy -= 60 * dt;
    });
    tank.particles = tank.particles.filter(p => p.life < p.max);
    tank.texts.forEach(t => { t.life += dt; t.y -= 40 * dt; });
    tank.texts = tank.texts.filter(t => t.life < t.max);

    tank.shake = Math.max(0, tank.shake - dt);
  };

  // ---------- Zeichnen ----------

  tank.draw = function draw(ctx) {
    ctx.save();
    if (tank.shake > 0) {
      const k = tank.shake * 22;
      ctx.translate(rand(-k, k), rand(-k, k));
    }
    drawWater(ctx, tank);
    drawRays(ctx, tank);
    drawBackPlants(ctx, tank);
    drawSand(ctx, tank);
    drawRocks(ctx, tank);
    drawFrontPlants(ctx, tank);
    drawLurkFin(ctx, tank);
    tank.bubbles.forEach(b => drawBubble(ctx, b.x, b.y, b.r, 0.55));
    tank.fish.forEach(f => { if (!f.away) drawFish(ctx, f, tank.time); });
    tank.specials.forEach(f => { if (!f.away) drawSpecialFish(ctx, f, tank.time); });
    if (!tank.showcase && tank.shark.state !== 'away') drawShark(ctx, tank.shark, tank.time);
    tank.particles.forEach(p => drawParticle(ctx, p));
    drawSurface(ctx, tank);
    tank.texts.forEach(t => drawText(ctx, t));
    // Gefahr: leichter dunkler Schleier
    if (tank.tension > 0) {
      ctx.fillStyle = `rgba(10, 18, 48, ${0.22 * tank.tension})`;
      ctx.fillRect(-40, -40, WORLD_W + 80, WORLD_H + 80);
    }
    ctx.restore();
  };

  tank.reset(tank.maxFish);
  return tank;
}

// ============================================================================
// Zeichenfunktionen
// ============================================================================

function drawWater(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  g.addColorStop(0, '#8be0f5');
  g.addColorStop(0.45, '#3a9fd6');
  g.addColorStop(1, '#14507f');
  ctx.fillStyle = g;
  ctx.fillRect(-40, -40, WORLD_W + 80, WORLD_H + 80);
}

function drawRays(ctx, tank) {
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const sway = Math.sin(tank.time * 0.35 + i * 1.7) * 60;
    const x = 160 + i * 340 + sway;
    const g = ctx.createLinearGradient(0, 0, 0, WORLD_H * 0.8);
    g.addColorStop(0, 'rgba(255,255,255,0.20)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 90, 0);
    ctx.lineTo(x + 260 + sway * 0.5, WORLD_H * 0.8);
    ctx.lineTo(x + 40 + sway * 0.5, WORLD_H * 0.8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawPlant(ctx, p, t, alpha) {
  const baseY = WORLD_H - SAND_H + 14;
  const segs = 7;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = `hsla(${p.hue}, 55%, ${alpha > 0.9 ? 36 : 30}%, ${alpha})`;
  ctx.lineWidth = p.w;
  ctx.beginPath();
  ctx.moveTo(p.x, baseY);
  for (let i = 1; i <= segs; i++) {
    const k = i / segs;
    const sway = Math.sin(t * 1.1 + p.seed + i * 0.55) * 26 * k;
    ctx.lineTo(p.x + sway, baseY - p.h * k);
  }
  ctx.stroke();
  ctx.restore();
}

function drawBackPlants(ctx, tank) {
  tank.plants.filter((_, i) => i % 2 === 0).forEach(p => drawPlant(ctx, p, tank.time, 0.75));
}
function drawFrontPlants(ctx, tank) {
  tank.plants.filter((_, i) => i % 2 === 1).forEach(p => drawPlant(ctx, p, tank.time, 1));
}

function drawSand(ctx) {
  const top = WORLD_H - SAND_H;
  ctx.fillStyle = '#e8d6a2';
  ctx.beginPath();
  ctx.moveTo(-40, WORLD_H + 40);
  ctx.lineTo(-40, top + 20);
  for (let x = -40; x <= WORLD_W + 40; x += 40) {
    ctx.lineTo(x, top + 10 + Math.sin(x * 0.012) * 14 + Math.sin(x * 0.04) * 4);
  }
  ctx.lineTo(WORLD_W + 40, WORLD_H + 40);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(180,150,90,0.35)';
  for (let i = 0; i < 26; i++) {
    const x = (i * 197) % WORLD_W;
    const y = top + 40 + ((i * 53) % (SAND_H - 50));
    ctx.beginPath();
    ctx.ellipse(x, y, 8 + (i % 3) * 3, 4 + (i % 2) * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRocks(ctx, tank) {
  const base = WORLD_H - SAND_H + 34;
  tank.rocks.forEach(r => {
    ctx.fillStyle = '#7d8a93';
    ctx.beginPath();
    ctx.ellipse(r.x, base, r.w / 2, r.h, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.ellipse(r.x - r.w * 0.15, base - r.h * 0.55, r.w * 0.22, r.h * 0.22, -0.4, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawBubble(ctx, x, y, r, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawParticle(ctx, p) {
  if (p.life < 0) return;
  const k = 1 - p.life / p.max;
  if (p.kind === 'bubble') {
    drawBubble(ctx, p.x, p.y, p.r, clamp(k * 1.3, 0, 0.85));
  } else {
    ctx.save();
    ctx.globalAlpha = clamp(k * 1.4, 0, 1);
    ctx.fillStyle = '#fff6b0';
    ctx.translate(p.x, p.y);
    ctx.rotate(p.life * 4);
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.moveTo(0, 0);
      ctx.lineTo(p.r * 0.35, p.r * 0.35);
      ctx.lineTo(0, p.r * 1.3);
      ctx.lineTo(-p.r * 0.35, p.r * 0.35);
    }
    ctx.fill();
    ctx.restore();
  }
}

function drawText(ctx, t) {
  const k = t.life / t.max;
  ctx.save();
  ctx.globalAlpha = clamp(1.6 - k * 1.6, 0, 1);
  ctx.font = "700 84px 'Caveat', 'Comic Sans MS', cursive";
  ctx.textAlign = 'center';
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#26313a';
  ctx.fillStyle = '#fff';
  const scale = 0.7 + Math.min(1, k * 4) * 0.5;
  ctx.translate(t.x, t.y);
  ctx.scale(scale, scale);
  ctx.strokeText(t.text, 0, 0);
  ctx.fillText(t.text, 0, 0);
  ctx.restore();
}

function drawSurface(ctx, tank) {
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.moveTo(-40, -40);
  ctx.lineTo(WORLD_W + 40, -40);
  for (let x = WORLD_W + 40; x >= -40; x -= 20) {
    ctx.lineTo(x, SURFACE_Y + Math.sin(x * 0.02 + tank.time * 1.6) * 5);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = -40; x <= WORLD_W + 40; x += 20) {
    const y = SURFACE_Y + Math.sin(x * 0.02 + tank.time * 1.6) * 5;
    if (x === -40) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

// Rückenflosse, die an der Oberfläche kreist, wenn es unruhig wird
function drawLurkFin(ctx, tank) {
  if (tank.shark.state !== 'away' || tank.tension < 0.3 || tank.fish.length === 0) return;
  const alpha = clamp((tank.tension - 0.3) / 0.4, 0, 1);
  const { x, dir } = tank.lurk;
  const y = SURFACE_Y + 34;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.fillStyle = '#566d7c';
  ctx.beginPath();
  ctx.moveTo(-34, 0);
  ctx.quadraticCurveTo(-8, -20, 6, -66);
  ctx.quadraticCurveTo(30, -22, 44, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-70, 4);
  ctx.quadraticCurveTo(-40, -2, -20, 4);
  ctx.moveTo(48, 4);
  ctx.quadraticCurveTo(70, -2, 96, 4);
  ctx.stroke();
  ctx.restore();
}

function drawSpecialFish(ctx, f, t) {
  const grow = f.spawnT < 1 ? 1 - Math.pow(1 - f.spawnT, 3) : 1;
  const s = f.size * TIER_SCALE[f.tier] * grow;
  if (s < 1) return;
  const tilt = clamp((f.vy / (f.baseSpeed + 40)) * 0.6, -0.4, 0.4);
  ctx.save();
  ctx.translate(f.x, f.y + Math.sin(t * 2 + f.phase) * 1.5);
  drawSpecialLeague(ctx, f.id, s, { phase: f.phase, panic: f.panic, t }, f.league, f.dir, tilt);
  ctx.restore();
}

function drawFish(ctx, f, t) {
  const grow = f.spawnT < 1 ? 1 - Math.pow(1 - f.spawnT, 3) : 1;
  const s = f.size * grow;
  if (s < 1) return;
  const h = f.hue;
  const tilt = clamp((f.vy / (f.baseSpeed + 40)) * 0.6, -0.4, 0.4);
  const wag = Math.sin(f.phase) * s * 0.28;

  ctx.save();
  ctx.translate(f.x, f.y + Math.sin(t * 2 + f.phase) * 1.5);
  ctx.scale(f.dir, 1);
  ctx.rotate(tilt);

  // Schwanz
  ctx.fillStyle = `hsl(${h + 14}, 85%, 46%)`;
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, 0);
  ctx.quadraticCurveTo(-s * 1.1, -s * 0.1 + wag * 0.5, -s * 1.5, -s * 0.62 + wag);
  ctx.quadraticCurveTo(-s * 1.22, wag * 0.8, -s * 1.5, s * 0.62 + wag);
  ctx.quadraticCurveTo(-s * 1.1, s * 0.1 + wag * 0.5, -s * 0.7, 0);
  ctx.fill();

  // Rückenflosse
  ctx.beginPath();
  ctx.moveTo(-s * 0.35, -s * 0.46);
  ctx.quadraticCurveTo(-s * 0.05, -s * 1.0 - wag * 0.2, s * 0.35, -s * 0.46);
  ctx.closePath();
  ctx.fill();

  // Körper
  ctx.fillStyle = `hsl(${h}, 90%, 58%)`;
  ctx.beginPath();
  ctx.ellipse(0, 0, s, s * 0.58, 0, 0, Math.PI * 2);
  ctx.fill();

  // Bauch
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, s * 0.18, s * 0.86, s * 0.36, 0, 0, Math.PI);
  ctx.fill();

  // Streifen
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = s * 0.13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(-s * 0.18, 0, s * 0.2, s * 0.46, 0, -Math.PI / 2.3, Math.PI / 2.3);
  ctx.stroke();

  // Seitenflosse
  ctx.fillStyle = `hsl(${h + 14}, 85%, 46%)`;
  ctx.beginPath();
  ctx.ellipse(-s * 0.05, s * 0.16, s * 0.22, s * 0.11, 0.5 + Math.sin(f.phase * 1.3) * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Auge
  const er = s * (0.2 + f.panic * 0.07);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(s * 0.52, -s * 0.13, er, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b2530';
  ctx.beginPath();
  ctx.arc(s * 0.52 + er * 0.2, -s * 0.13, er * (0.5 - f.panic * 0.12), 0, Math.PI * 2);
  ctx.fill();

  // Mund: Lächeln, bei Gefahr ein erschrockenes "O"
  ctx.strokeStyle = 'rgba(30,20,20,0.75)';
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.beginPath();
  if (f.panic > 0.5) {
    ctx.arc(s * 0.92, s * 0.12, s * 0.09, 0, Math.PI * 2);
  } else {
    ctx.arc(s * 0.78, s * 0.06, s * 0.16, 0.2, 1.1);
  }
  ctx.stroke();

  ctx.restore();
}

function drawShark(ctx, s, t) {
  const L = SHARK_LENGTH;
  const h = L * 0.16;
  const wag = Math.sin(t * 7) * h * 0.22;
  const open = s.mouth;

  ctx.save();
  ctx.translate(s.x, s.y + Math.sin(t * 3) * 4);
  ctx.scale(s.dir, 1);

  const grey = '#5f7a8d';
  const dark = '#4a6273';

  // Schwanzflosse
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-L * 0.36, -h * 0.05);
  ctx.quadraticCurveTo(-L * 0.5, -h * 0.2 + wag * 0.5, -L * 0.66, -h * 1.15 + wag);
  ctx.quadraticCurveTo(-L * 0.58, -h * 0.1 + wag * 0.6, -L * 0.58, h * 0.1 + wag * 0.6);
  ctx.quadraticCurveTo(-L * 0.62, h * 0.7 + wag, -L * 0.64, h * 0.9 + wag);
  ctx.quadraticCurveTo(-L * 0.5, h * 0.3 + wag * 0.5, -L * 0.36, h * 0.1);
  ctx.closePath();
  ctx.fill();

  // Rückenflosse
  ctx.beginPath();
  ctx.moveTo(L * 0.15, -h * 0.75);
  ctx.quadraticCurveTo(L * 0.12, -h * 1.95, L * 0.02, -h * 2.05);
  ctx.quadraticCurveTo(L * 0.02, -h * 1.1, -L * 0.01, -h * 0.75);
  ctx.closePath();
  ctx.fill();

  // Körper
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(L * 0.5, h * 0.12);
    ctx.bezierCurveTo(L * 0.34, -h * 1.0, -L * 0.1, -h * 1.1, -L * 0.4, -h * 0.12);
    ctx.lineTo(-L * 0.4, h * 0.14);
    ctx.bezierCurveTo(-L * 0.12, h * 0.95, L * 0.3, h * 1.0, L * 0.5, h * 0.2);
    ctx.closePath();
  };
  ctx.fillStyle = grey;
  bodyPath();
  ctx.fill();

  // Heller Bauch
  ctx.save();
  bodyPath();
  ctx.clip();
  ctx.fillStyle = '#e9f1f5';
  ctx.beginPath();
  ctx.moveTo(L * 0.55, h * 0.3);
  ctx.bezierCurveTo(L * 0.25, h * 0.15, -L * 0.1, h * 0.25, -L * 0.45, h * 0.0);
  ctx.lineTo(-L * 0.45, h * 1.4);
  ctx.lineTo(L * 0.55, h * 1.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // Kiemen
  ctx.strokeStyle = 'rgba(40,55,65,0.55)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(L * 0.1 - i * 20, -h * 0.35);
    ctx.quadraticCurveTo(L * 0.07 - i * 20, h * 0.0, L * 0.1 - i * 20, h * 0.3);
    ctx.stroke();
  }

  // Brustflosse
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(L * 0.18, h * 0.5);
  ctx.quadraticCurveTo(L * 0.18, h * 1.2, L * 0.15, h * 1.55);
  ctx.quadraticCurveTo(L * 0.07, h * 0.9, L * 0.096, h * 0.4);
  ctx.closePath();
  ctx.fill();

  // Maul
  const mouthH = open * h * 0.75;
  if (mouthH > 2) {
    ctx.fillStyle = '#3a1520';
    ctx.beginPath();
    ctx.moveTo(L * 0.5, h * 0.2);
    ctx.lineTo(L * 0.17, h * 0.3);
    ctx.quadraticCurveTo(L * 0.2, h * 0.3 + mouthH * 1.05, L * 0.34, h * 0.3 + mouthH * 1.1);
    ctx.quadraticCurveTo(L * 0.46, h * 0.3 + mouthH * 0.8, L * 0.5, h * 0.2 + mouthH * 0.25);
    ctx.closePath();
    ctx.fill();

    // Zähne oben
    ctx.fillStyle = '#fff';
    const teeth = 6;
    for (let i = 0; i < teeth; i++) {
      const x0 = L * 0.19 + (L * 0.3 * i) / teeth;
      const w = (L * 0.3) / teeth;
      const yTop = h * 0.3 - (i / teeth) * h * 0.1 + (h * 0.2 - h * 0.3) * (i / teeth);
      ctx.beginPath();
      ctx.moveTo(x0, yTop);
      ctx.lineTo(x0 + w, yTop);
      ctx.lineTo(x0 + w / 2, yTop + h * 0.2);
      ctx.closePath();
      ctx.fill();
    }
    // Zähne unten
    for (let i = 0; i < 5; i++) {
      const x0 = L * 0.22 + (L * 0.24 * i) / 5;
      const w = (L * 0.24) / 5;
      const yb = h * 0.3 + mouthH * 1.05;
      ctx.beginPath();
      ctx.moveTo(x0, yb);
      ctx.lineTo(x0 + w, yb);
      ctx.lineTo(x0 + w / 2, yb - h * 0.17);
      ctx.closePath();
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = 'rgba(40,55,65,0.7)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(L * 0.5, h * 0.2);
    ctx.quadraticCurveTo(L * 0.34, h * 0.36, L * 0.2, h * 0.28);
    ctx.stroke();
  }

  // Auge mit grimmiger Braue
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(L * 0.33, -h * 0.3, h * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(L * 0.345, -h * 0.28, h * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2d3f4b';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(L * 0.27, -h * 0.62);
  ctx.lineTo(L * 0.4, -h * 0.4);
  ctx.stroke();

  ctx.restore();
}
