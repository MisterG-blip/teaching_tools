// ============================================================================
// MODULE: Aquarium-Fische
// PURPOSE: Die besonderen Fische, die man mit Pokalen freischaltet. Jeder Pokal
//          hat seinen eigenen Fisch (Clownfisch, Doktorfisch ...). Reine
//          Zeichenfunktionen, kein DOM-Zugriff außer in drawSpeciesPreview().
//
// Alle Fische werden nach rechts schauend um den Ursprung (0, 0) gezeichnet.
// `s` ist die halbe Körperlänge. Der Aufrufer verschiebt, spiegelt und kippt.
// ============================================================================

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Größe je Pokal-Stufe (0 = nicht freigeschaltet, 1 = Bronze, 2 = Silber, 3 = Gold)
export const TIER_SCALE = [0, 1, 1.15, 1.3];

// id = ID des Pokals aus aquarium-records.js ('platin' für die Aquarium-Legende)
export const SPECIES = {
  quiet:     { name: 'Clownfisch',        size: 40 },
  fish:      { name: 'Doktorfisch',       size: 42 },
  sharkfree: { name: 'Kugelfisch',        size: 38 },
  total:     { name: 'Kaiserfisch',       size: 40 },
  rescued:   { name: 'Rettungsringfisch', size: 40 },
  comeback:  { name: 'Mandarinfisch',     size: 36 },
  pond:      { name: 'Neonfisch',         size: 36 },
  platin:    { name: 'Königsfisch',       size: 50 }
};

// ---------- gemeinsame Bausteine ----------

function ellipsePath(ctx, rx, ry) {
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
}

function tailFin(ctx, s, wag, color, spread = 0.62, length = 1.5) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-s * 0.7, 0);
  ctx.quadraticCurveTo(-s * 1.1, -s * 0.1 + wag * 0.5, -s * length, -s * spread + wag);
  ctx.quadraticCurveTo(-s * (length - 0.28), wag * 0.8, -s * length, s * spread + wag);
  ctx.quadraticCurveTo(-s * 1.1, s * 0.1 + wag * 0.5, -s * 0.7, 0);
  ctx.fill();
}

function eye(ctx, s, ex, ey, panic, size = 0.2) {
  const er = s * (size + panic * 0.07);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ex, ey, er, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1b2530';
  ctx.beginPath();
  ctx.arc(ex + er * 0.2, ey, er * (0.5 - panic * 0.12), 0, Math.PI * 2);
  ctx.fill();
}

function mouth(ctx, s, mx, my, panic) {
  ctx.strokeStyle = 'rgba(30,20,20,0.75)';
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.beginPath();
  if (panic > 0.5) ctx.arc(mx + s * 0.14, my + s * 0.06, s * 0.09, 0, Math.PI * 2);
  else ctx.arc(mx, my, s * 0.16, 0.2, 1.1);
  ctx.stroke();
}

function sideFin(ctx, s, color, phase) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(-s * 0.05, s * 0.16, s * 0.22, s * 0.11, 0.5 + Math.sin(phase * 1.3) * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

// Standard-Fisch mit eigener Farbe und Muster
function bodyFish(ctx, s, o, spec) {
  const rx = s * (spec.rx || 1);
  const ry = s * (spec.ry || 0.58);
  const wag = Math.sin(o.phase) * s * 0.28;

  if (spec.backFins) spec.backFins(ctx, s, rx, ry, wag);
  else {
    // Rückenflosse
    ctx.fillStyle = spec.fin;
    ctx.beginPath();
    ctx.moveTo(-s * 0.35, -ry * 0.8);
    ctx.quadraticCurveTo(-s * 0.05, -ry * 1.75 - wag * 0.2, s * 0.35, -ry * 0.8);
    ctx.closePath();
    ctx.fill();
  }
  tailFin(ctx, s, wag, spec.tail || spec.fin, spec.tailSpread || 0.62);

  // Körper
  ctx.fillStyle = typeof spec.body === 'function' ? spec.body(ctx, s, rx, ry) : spec.body;
  ellipsePath(ctx, rx, ry);
  ctx.fill();

  // Muster nur innerhalb des Körpers
  ctx.save();
  ellipsePath(ctx, rx, ry);
  ctx.clip();
  if (spec.decorate) spec.decorate(ctx, s, rx, ry, o);
  // Bauch
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath();
  ctx.ellipse(0, ry * 0.3, rx * 0.88, ry * 0.5, 0, 0, Math.PI);
  ctx.fill();
  ctx.restore();

  if (spec.outline) {
    ctx.strokeStyle = spec.outline;
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ellipsePath(ctx, rx, ry);
    ctx.stroke();
  }

  sideFin(ctx, s, spec.fin, o.phase);
  eye(ctx, s, rx * 0.52, -ry * 0.22, o.panic, spec.eyeSize || 0.2);
  mouth(ctx, s, rx * 0.78, ry * 0.08, o.panic);
  if (spec.front) spec.front(ctx, s, rx, ry, o);
}

// ---------- die Arten ----------

const SPEC = {
  // Clownfisch: orange mit weißen, schwarz eingefassten Streifen
  quiet: {
    body: '#ff7a1a', fin: '#ff8f2e', outline: '#2a1a10',
    decorate(ctx, s, rx, ry) {
      [[0.5, 0.16], [-0.02, 0.22], [-0.6, 0.16]].forEach(([x, w]) => {
        ctx.fillStyle = '#fff';
        ctx.fillRect(s * x - (s * w) / 2, -ry, s * w, ry * 2);
        ctx.fillStyle = '#2a1a10';
        ctx.fillRect(s * x - (s * w) / 2 - 3, -ry, 3, ry * 2);
        ctx.fillRect(s * x + (s * w) / 2, -ry, 3, ry * 2);
      });
    }
  },

  // Doktorfisch: blau mit schwarzer "Palette" und gelbem Schwanz
  fish: {
    body: '#2f73e6', fin: '#ffd21f', tail: '#ffd21f',
    decorate(ctx, s, rx, ry) {
      ctx.fillStyle = '#0f1f3d';
      ctx.beginPath();
      ctx.moveTo(s * 0.15, -ry * 1.05);
      ctx.bezierCurveTo(s * 0.62, -ry * 0.6, s * 0.5, ry * 0.15, s * 0.02, ry * 0.2);
      ctx.bezierCurveTo(-s * 0.3, ry * 0.25, -s * 0.6, ry * 0.3, -s * 1.0, 0);
      ctx.lineTo(-s * 1.0, -ry * 1.05);
      ctx.closePath();
      ctx.fill();
    }
  },

  // Kaiserfisch: hoher Körper, lange Flossen, gelb-blau
  total: {
    rx: 0.8, ry: 0.95, body: '#ffd23f', fin: '#3a78d8', tail: '#3a78d8', tailSpread: 0.5, eyeSize: 0.17,
    backFins(ctx, s, rx, ry, wag) {
      ctx.fillStyle = '#3a78d8';
      ctx.beginPath();
      ctx.moveTo(s * 0.2, -ry * 0.88);
      ctx.quadraticCurveTo(-s * 0.1, -ry * 1.55, -s * 0.85, -ry * 1.35 + wag * 0.3);
      ctx.quadraticCurveTo(-s * 0.6, -ry * 1.0, -s * 0.5, -ry * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s * 0.18, ry * 0.88);
      ctx.quadraticCurveTo(-s * 0.1, ry * 1.5, -s * 0.8, ry * 1.3 + wag * 0.3);
      ctx.quadraticCurveTo(-s * 0.58, ry * 0.98, -s * 0.5, ry * 0.65);
      ctx.closePath();
      ctx.fill();
    },
    decorate(ctx, s, rx, ry) {
      ctx.strokeStyle = '#3a78d8';
      ctx.lineWidth = s * 0.14;
      [0.25, -0.2, -0.6].forEach(x => {
        ctx.beginPath();
        ctx.moveTo(s * x + s * 0.12, -ry);
        ctx.quadraticCurveTo(s * x - s * 0.12, 0, s * x + s * 0.12, ry);
        ctx.stroke();
      });
    }
  },

  // Rettungsringfisch: weiß mit roten Bändern wie ein Rettungsring
  rescued: {
    body: '#ffffff', fin: '#e53935', tail: '#e53935', outline: '#b0bec5',
    decorate(ctx, s, rx, ry) {
      ctx.fillStyle = '#e53935';
      [[0.52, 0.26], [-0.08, 0.26], [-0.68, 0.26]].forEach(([x, w]) => {
        ctx.fillRect(s * x - (s * w) / 2, -ry, s * w, ry * 2);
      });
    }
  },

  // Mandarinfisch: türkis mit orangen Schnörkeln und blauen Punkten
  comeback: {
    body: '#18b6b0', fin: '#ff8f1f', tail: '#ff8f1f',
    decorate(ctx, s, rx, ry) {
      ctx.strokeStyle = '#ff8f1f';
      ctx.lineWidth = s * 0.09;
      ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const y = -ry * 0.7 + i * ry * 0.5;
        ctx.beginPath();
        for (let x = -rx; x <= rx; x += s * 0.1) {
          const yy = y + Math.sin(x / (s * 0.18) + i) * ry * 0.12;
          if (x === -rx) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      ctx.fillStyle = '#2f5bd9';
      [[0.1, -0.1], [-0.35, 0.2], [0.45, 0.25], [-0.6, -0.25]].forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(s * x, ry * y * 2, s * 0.06, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  },

  // Neonfisch: schlank, leuchtender Streifen, roter Hinterkörper
  pond: {
    ry: 0.36, body: '#dcecff', fin: 'rgba(200,220,245,0.9)', tail: 'rgba(200,220,245,0.9)', tailSpread: 0.42, eyeSize: 0.22,
    decorate(ctx, s, rx, ry) {
      ctx.fillStyle = '#ff3d3d';
      ctx.fillRect(-rx, ry * 0.0, rx * 1.2, ry);
      ctx.save();
      ctx.shadowColor = '#26e0ff';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = '#26e0ff';
      ctx.lineWidth = s * 0.13;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-rx * 0.8, -ry * 0.12);
      ctx.lineTo(rx * 0.85, -ry * 0.12);
      ctx.stroke();
      ctx.restore();
    }
  },

  // Königsfisch (Platin): golden, mit Krone
  platin: {
    body(ctx, s, rx, ry) {
      const g = ctx.createLinearGradient(0, -ry, 0, ry);
      g.addColorStop(0, '#ffe27a');
      g.addColorStop(0.55, '#ffb62e');
      g.addColorStop(1, '#ff8a1a');
      return g;
    },
    fin: '#ff9f1a', tail: '#ffcb3d', outline: '#b8741a',
    decorate(ctx, s, rx, ry, o) {
      // Schuppenglanz, der über den Körper wandert
      const x = ((o.t * 0.6) % 2.4 - 1.2) * s;
      ctx.fillStyle = 'rgba(255,255,255,0.42)';
      ctx.beginPath();
      ctx.moveTo(x, -ry);
      ctx.lineTo(x + s * 0.28, -ry);
      ctx.lineTo(x - s * 0.1, ry);
      ctx.lineTo(x - s * 0.38, ry);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(184,116,26,0.45)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) {
        for (let j = -1; j <= 1; j++) {
          ctx.beginPath();
          ctx.arc(-s * 0.55 + i * s * 0.42, j * ry * 0.5, s * 0.2, -0.9, 0.9);
          ctx.stroke();
        }
      }
    },
    front(ctx, s, rx, ry) {
      // Krone auf dem Kopf
      const cx = rx * 0.38, cy = -ry * 0.95;
      ctx.fillStyle = '#ffd23f';
      ctx.strokeStyle = '#b8741a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.26, cy + s * 0.02);
      ctx.lineTo(cx - s * 0.3, cy - s * 0.34);
      ctx.lineTo(cx - s * 0.13, cy - s * 0.16);
      ctx.lineTo(cx, cy - s * 0.4);
      ctx.lineTo(cx + s * 0.13, cy - s * 0.16);
      ctx.lineTo(cx + s * 0.3, cy - s * 0.34);
      ctx.lineTo(cx + s * 0.26, cy + s * 0.02);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#e53935';
      ctx.beginPath();
      ctx.arc(cx, cy - s * 0.08, s * 0.06, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

// Kugelfisch: rund, bläht sich bei Gefahr auf
function drawPuffer(ctx, s, o) {
  const inflate = 1 + clamp(o.panic, 0, 1) * 0.45;
  const r = s * 0.82 * inflate;
  const wag = Math.sin(o.phase * 1.4) * s * 0.18;

  // kleiner Schwanz
  ctx.fillStyle = '#d9b84a';
  ctx.beginPath();
  ctx.moveTo(-r * 0.85, 0);
  ctx.lineTo(-r * 1.35, -s * 0.28 + wag);
  ctx.lineTo(-r * 1.35, s * 0.28 + wag);
  ctx.closePath();
  ctx.fill();

  // Stacheln (nur aufgebläht)
  if (inflate > 1.12) {
    ctx.fillStyle = '#b8932f';
    const n = 16;
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n;
      const bx = Math.cos(a) * r, by = Math.sin(a) * r;
      ctx.beginPath();
      ctx.moveTo(bx - Math.sin(a) * s * 0.07, by + Math.cos(a) * s * 0.07);
      ctx.lineTo(bx + Math.cos(a) * s * 0.26, by + Math.sin(a) * s * 0.26);
      ctx.lineTo(bx + Math.sin(a) * s * 0.07, by - Math.cos(a) * s * 0.07);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Körper
  ctx.fillStyle = '#f6df86';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.45, r * 0.95, r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b98c2d';
  [[-0.2, -0.5], [0.15, -0.55], [-0.5, -0.2], [-0.05, -0.15], [-0.4, 0.2], [0.25, -0.25]].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(r * x, r * y, r * 0.07, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // Flosse
  ctx.fillStyle = '#d9b84a';
  ctx.beginPath();
  ctx.ellipse(-r * 0.05, r * 0.2, r * 0.22, r * 0.12, 0.4 + Math.sin(o.phase * 2) * 0.5, 0, Math.PI * 2);
  ctx.fill();

  eye(ctx, s, r * 0.5, -r * 0.2, o.panic, 0.24);
  ctx.strokeStyle = 'rgba(30,20,20,0.75)';
  ctx.lineWidth = Math.max(1.5, s * 0.05);
  ctx.beginPath();
  if (inflate > 1.2) ctx.arc(r * 0.88, r * 0.12, s * 0.09, 0, Math.PI * 2);
  else ctx.arc(r * 0.72, r * 0.18, s * 0.13, 0.2, 1.2);
  ctx.stroke();
}

/**
 * Zeichnet eine besondere Art um den Ursprung, nach rechts schauend.
 * @param {string} id  Pokal-ID ('quiet', ..., 'platin')
 * @param {number} s   halbe Körperlänge (bereits mit Stufen-Skalierung)
 * @param {{phase:number, panic:number, t:number}} o
 */
export function drawSpecial(ctx, id, s, o) {
  const opts = { phase: o.phase || 0, panic: o.panic || 0, t: o.t || 0 };
  if (id === 'sharkfree') drawPuffer(ctx, s, opts);
  else if (SPEC[id]) bodyFish(ctx, s, opts, SPEC[id]);
}

/**
 * Kleine Vorschau für den Trophäenschrank.
 * unlocked=false zeichnet eine graue Silhouette.
 */
export function drawSpeciesPreview(canvas, id, tier, unlocked) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = 120, H = 70;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const spec = SPECIES[id];
  if (!spec) return;
  const s = (spec.size * 0.75) * (unlocked ? TIER_SCALE[Math.max(1, tier)] / 1.3 : 0.8);

  ctx.save();
  ctx.translate(W / 2 + 4, H / 2);
  drawSpecial(ctx, id, s, { phase: 0.6, panic: 0, t: 1 });
  ctx.restore();

  if (!unlocked) {
    // Silhouette: alles Gezeichnete einfärben
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#9aa5ae';
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
}
