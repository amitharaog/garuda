/* Scroll engine: one rAF loop drives every scroll-scrubbed scene. Page scrolling stays native; each scene eases
   its own progress toward the scroll position, which gives the inertial feel without hijacking the wheel. */
import { useEffect, useRef } from 'react';

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Map p from [a, b] to [0, 1], clamped. */
export const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
export const ease = {
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t * t,
  sine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
};

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface Frame {
  /** Scene progress, 0..1. */
  p: number;
  /** Smoothed scroll velocity in px per frame (signed). */
  vel: number;
  /** Seconds since the loop started (for idle animation). */
  t: number;
  vh: number;
  vw: number;
  /** True while any part of the element is on screen. */
  visible: boolean;
}

type Mode = 'sticky' | 'view';
interface Scene { el: HTMLElement; mode: Mode; cb: (f: Frame) => void; sp: number; off: boolean }

const scenes = new Set<Scene>();
const tickers = new Set<(t: number) => void>();
let running = false;
let lastY = 0;
let vel = 0;
const t0 = typeof performance !== 'undefined' ? performance.now() : 0;

function loop(now: number) {
  const y = window.scrollY;
  vel = lerp(vel, y - lastY, 0.12);
  lastY = y;
  const vh = window.innerHeight, vw = window.innerWidth, t = (now - t0) / 1000;
  const k = reducedMotion() ? 1 : 0.14;
  for (const s of scenes) {
    const r = s.el.getBoundingClientRect();
    const target = s.mode === 'sticky'
      ? clamp(-r.top / Math.max(1, r.height - vh))
      : clamp((vh - r.top) / (vh + r.height));
    const visible = r.bottom > -vh * 0.25 && r.top < vh * 1.25;
    // Snap when far off screen (jumps, reloads); ease otherwise.
    s.sp = !visible || Math.abs(target - s.sp) > 0.25 ? target : lerp(s.sp, target, k);
    if (Math.abs(target - s.sp) < 0.00005) s.sp = target;
    if (!visible) { if (!s.off) { s.off = true; s.cb({ p: target, vel, t, vh, vw, visible: false }); } continue; }
    s.off = false;
    s.cb({ p: s.sp, vel, t, vh, vw, visible: true });
  }
  tickers.forEach(fn => fn(t));
  requestAnimationFrame(loop);
}

function start() {
  if (running || typeof window === 'undefined') return;
  running = true;
  lastY = window.scrollY;
  requestAnimationFrame(loop);
}

export function initSmoothScroll() { start(); }

export function scrollToEl(el: Element | null, offset = 0) {
  if (!el) return;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + offset, behavior: reducedMotion() ? 'auto' : 'smooth' });
}

/** Register a scroll scene. 'sticky' = progress across a tall section with a sticky stage; 'view' = as the element crosses the viewport. */
export function useScene<T extends HTMLElement>(cb: (f: Frame) => void, mode: Mode = 'sticky') {
  const ref = useRef<T | null>(null);
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    start();
    const s: Scene = { el, mode, cb: f => cbRef.current(f), sp: 0, off: false };
    scenes.add(s);
    return () => { scenes.delete(s); };
  }, [mode]);
  return ref;
}

/** Run a callback every frame (idle animation: globe, marquees). */
export function useTicker(fn: (t: number) => void) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    start();
    const f = (t: number) => fnRef.current(t);
    tickers.add(f);
    return () => { tickers.delete(f); };
  }, []);
}
