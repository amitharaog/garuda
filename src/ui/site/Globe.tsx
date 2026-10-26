/* Hero globe: dotted land on a dark sphere with a blue atmosphere, slowly turning, with the UK → DE / FR / NL lanes drawn as glowing arcs.
   Drawn for speed: the sphere and halo are cached, dots are projected with plain trig (no per-dot d3 call) and filled in a few batches,
   and glows are layered strokes rather than canvas shadow blur. */
import { useEffect, useRef } from 'react';
import { geoEquirectangular, geoInterpolate, geoPath } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';
import land110 from 'world-atlas/land-110m.json';
import { reducedMotion, useTicker } from './motion';

type LonLat = [number, number];
const D2R = Math.PI / 180;
const HUBS: Array<{ name: string; at: LonLat; dx: number; dy: number }> = [
  { name: 'UK', at: [-2.24, 53.48], dx: -40, dy: -22 },
  { name: 'GERMANY', at: [8.68, 50.11], dx: 14, dy: -6 },
  { name: 'FRANCE', at: [2.35, 48.86], dx: -30, dy: 22 },
  { name: 'NETHERLANDS', at: [4.9, 52.37], dx: 12, dy: -28 },
];
/** Each lane as 25 points along the great circle, precomputed once. */
const LANES: LonLat[][] = [1, 2, 3].map(i => {
  const f = geoInterpolate(HUBS[0].at, HUBS[i].at);
  return Array.from({ length: 25 }, (_, k) => f(k / 24) as LonLat);
});
const ALPHA_STEPS = 5;

/** Land sample points on a lon/lat grid, from an offscreen equirectangular render; stored as [sinφ, cosφ, sinλ, cosλ]. */
function landDots(step: number): Float32Array {
  const W = 720, H = 360;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  if (!ctx) return new Float32Array();
  const topo = land110 as unknown as Topology<{ land: GeometryCollection }>;
  const land = feature(topo, topo.objects.land) as unknown as GeoPermissibleObjects;
  const proj = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  geoPath(proj, ctx)(land);
  ctx.fill();
  const data = ctx.getImageData(0, 0, W, H).data;
  const out: number[] = [];
  for (let lat = -84; lat <= 84; lat += step) {
    const lonStep = step / Math.max(0.2, Math.cos(lat * D2R)); // even spacing on the sphere
    for (let lon = -180; lon < 180; lon += lonStep) {
      const x = Math.floor(((lon + 180) / 360) * W), y = Math.floor(((90 - lat) / 180) * H);
      if (data[(y * W + x) * 4 + 3] > 128) out.push(Math.sin(lat * D2R), Math.cos(lat * D2R), Math.sin(lon * D2R), Math.cos(lon * D2R));
    }
  }
  return new Float32Array(out);
}

interface State {
  dots: Float32Array; w: number; h: number; dpr: number; mx: number; my: number; tx: number; ty: number;
  base: HTMLCanvasElement | null;
}

/** Halo + sphere body, cached per size. */
function drawBase(s: State) {
  const c = document.createElement('canvas');
  c.width = Math.round(s.w * s.dpr); c.height = Math.round(s.h * s.dpr);
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  const R = Math.min(s.w, s.h) * 0.46, cx = s.w / 2, cy = s.h / 2;
  const halo = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.32);
  halo.addColorStop(0, 'rgba(40, 70, 255, 0.55)');
  halo.addColorStop(0.35, 'rgba(0, 40, 255, 0.22)');
  halo.addColorStop(1, 'rgba(0, 22, 203, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(cx, cy, R * 1.32, 0, Math.PI * 2); ctx.fill();
  const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
  body.addColorStop(0, '#0a1440');
  body.addColorStop(0.7, '#050a24');
  body.addColorStop(0.93, '#0b2fd6');
  body.addColorStop(1, '#5b7bff');
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
  // lit rim, upper left: a wide soft stroke under a thin bright one
  const rim = ctx.createLinearGradient(cx - R, cy - R, cx + R * 0.2, cy + R * 0.2);
  rim.addColorStop(0, 'rgba(255, 150, 60, 0.95)');
  rim.addColorStop(0.45, 'rgba(255, 120, 40, 0.2)');
  rim.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.strokeStyle = rim;
  ctx.globalAlpha = 0.25; ctx.lineWidth = 14;
  ctx.beginPath(); ctx.arc(cx, cy, R - 4, Math.PI * 0.95, Math.PI * 1.75); ctx.stroke();
  ctx.globalAlpha = 1; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.arc(cx, cy, R - 1, Math.PI * 0.95, Math.PI * 1.75); ctx.stroke();
  return c;
}

export function Globe() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const st = useRef<State | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const s: State = { dots: landDots(1.2), w: 0, h: 0, dpr: Math.min(1.5, window.devicePixelRatio || 1), mx: 0, my: 0, tx: 0, ty: 0, base: null };
    st.current = s;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      s.w = r.width; s.h = r.height;
      canvas.width = Math.round(r.width * s.dpr);
      canvas.height = Math.round(r.height * s.dpr);
      s.base = drawBase(s);
    };
    const onMove = (e: PointerEvent) => { s.tx = (e.clientX / window.innerWidth - 0.5) * 2; s.ty = (e.clientY / window.innerHeight - 0.5) * 2; };
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', onMove);
    return () => { window.removeEventListener('resize', resize); window.removeEventListener('pointermove', onMove); };
  }, []);

  useTicker(t => {
    const canvas = ref.current, s = st.current;
    if (!canvas || !s || !s.w || !s.base) return;
    if (canvas.getBoundingClientRect().bottom < 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const still = reducedMotion();
    s.mx += (s.tx - s.mx) * 0.04; s.my += (s.ty - s.my) * 0.04;
    const { w, h, dpr, dots } = s;
    const R = Math.min(w, h) * 0.46;
    const cx = w * 0.5, cy = h * 0.5;
    // centre of view (the d3 rotation [-λ0, -φ0])
    const lam0 = (4 - (still ? 0 : Math.sin(t * 0.12) * 9) - s.mx * 6) * D2R;
    const phi0 = (38 + s.my * 4) * D2R;
    const sl0 = Math.sin(lam0), cl0 = Math.cos(lam0), sp0 = Math.sin(phi0), cp0 = Math.cos(phi0);
    const project = (sp: number, cp: number, sl: number, cl: number): [number, number, number] => {
      const cdl = cl * cl0 + sl * sl0, sdl = sl * cl0 - cl * sl0; // cos/sin(λ - λ0)
      return [cx + R * cp * sdl, cy - R * (cp0 * sp - sp0 * cp * cdl), sp0 * sp + cp0 * cp * cdl];
    };
    const projectLL = ([lon, lat]: LonLat) => project(Math.sin(lat * D2R), Math.cos(lat * D2R), Math.sin(lon * D2R), Math.cos(lon * D2R));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(s.base, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // dots, batched into a few paths by colour and brightness
    const paths: Path2D[] = Array.from({ length: ALPHA_STEPS * 2 }, () => new Path2D());
    for (let i = 0; i < dots.length; i += 4) {
      const [x, y, c] = project(dots[i], dots[i + 1], dots[i + 2], dots[i + 3]);
      if (c < 0.02) continue;
      const rx = (x - cx) / R, ry = (y - cy) / R;
      const warm = Math.max(0, -rx * 0.7 - ry * 0.7) * (1 - c) > 0.25 ? 1 : 0;
      const step = Math.min(ALPHA_STEPS - 1, Math.floor(c * ALPHA_STEPS));
      const sz = 1 + c * 1.1;
      paths[warm * ALPHA_STEPS + step].rect(x - sz / 2, y - sz / 2, sz, sz);
    }
    for (let k = 0; k < ALPHA_STEPS; k++) {
      const a = 0.25 + ((k + 0.5) / ALPHA_STEPS) * 0.75;
      ctx.fillStyle = `rgba(206, 218, 255, ${(a * 0.9).toFixed(3)})`; ctx.fill(paths[k]);
      ctx.fillStyle = `rgba(255, 150, 70, ${a.toFixed(3)})`; ctx.fill(paths[ALPHA_STEPS + k]);
    }

    // lanes, lifted off the surface, with a travelling pulse
    LANES.forEach((lane, i) => {
      const pts = lane.map((ll, k) => {
        const [x, y, c] = projectLL(ll);
        const lift = Math.sin((k / 24) * Math.PI) * R * 0.05;
        return [x + ((x - cx) / R) * lift, y + ((y - cy) / R) * lift, c] as const;
      });
      if (pts.some(p => p[2] < 0)) return;
      const line = new Path2D();
      pts.forEach(([x, y], k) => (k ? line.lineTo(x, y) : line.moveTo(x, y)));
      ctx.strokeStyle = 'rgba(255, 120, 40, 0.28)'; ctx.lineWidth = 6; ctx.stroke(line);
      ctx.strokeStyle = 'rgba(255, 150, 70, 0.95)'; ctx.lineWidth = 1.6; ctx.stroke(line);
      const f = still ? 1 : ((t * 0.35 + i * 0.33) % 1);
      const [qx, qy] = pts[Math.min(24, Math.floor(f * 24))];
      const g = ctx.createRadialGradient(qx, qy, 0, qx, qy, 9);
      g.addColorStop(0, 'rgba(255, 255, 255, 1)'); g.addColorStop(0.3, 'rgba(255, 170, 90, .8)'); g.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(qx, qy, 9, 0, Math.PI * 2); ctx.fill();
    });

    // hub markers + labels
    ctx.font = "500 9px 'Space Mono', monospace";
    HUBS.forEach(hb => {
      const [x, y, c] = projectLL(hb.at);
      if (c < 0) return;
      ctx.fillStyle = '#ff9a4a';
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
      const tw = ctx.measureText(hb.name).width + 12;
      const lx = x + hb.dx, ly = y + hb.dy;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(lx, ly - 10, tw, 16);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(lx + 0.5, ly - 9.5, tw - 1, 15);
      ctx.fillStyle = '#fff';
      ctx.fillText(hb.name, lx + 6, ly + 1.5);
    });
  });

  return <canvas ref={ref} className="globe" aria-hidden="true" />;
}
