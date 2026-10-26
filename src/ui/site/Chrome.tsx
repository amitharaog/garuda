/* Site chrome: intro loader, fixed header (ticker, wordmark, menu, CTA) that adapts to the section under it. */
import { useEffect, useRef, useState } from 'react';
import { ALLOWED } from '../../domain';
import { reducedMotion, useTicker } from './motion';

export function Loader() {
  const [phase, setPhase] = useState<'in' | 'out' | 'done'>(() => (reducedMotion() ? 'done' : 'in'));
  useEffect(() => {
    if (phase === 'done') return;
    const a = setTimeout(() => setPhase('out'), 1500);
    const b = setTimeout(() => setPhase('done'), 2500);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (phase === 'done') return null;
  return (
    <div className={`loader ${phase}`} aria-hidden="true">
      {[0, 1, 2, 3, 4].map(i => <span key={i} className="loader-ring" style={{ animationDelay: `${i * 0.12}s` }} />)}
      <span className="loader-mark">GARUDA</span>
    </div>
  );
}

/** Every city Garuda collects from or delivers to. */
const CITIES = [...ALLOWED.originCity, ...ALLOWED.destCountry.flatMap(c => ALLOWED.destCities[c])];

export interface NavLink { label: string; go: () => void }

export function Header({ links, current, solid, onCta }: { links: NavLink[]; current: string; solid?: boolean; onCta: () => void }) {
  const ref = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const mode = useRef('dark');
  const compact = useRef(false);

  const tick = useRef(0);
  useTicker(() => {
    const el = ref.current;
    if (!el || tick.current++ % 4) return; // a hit-test every 4th frame is plenty
    // colour from the section under the header bar
    const probe = document.elementsFromPoint(window.innerWidth / 2, 70).find(n => n instanceof HTMLElement && n.closest('[data-header]') && !el.contains(n));
    const sec = probe instanceof HTMLElement ? probe.closest('[data-header]') as HTMLElement | null : null;
    const m = sec?.dataset.header || 'light';
    if (m !== mode.current) { mode.current = m; el.dataset.mode = m; }
    const c = window.scrollY > 120;
    if (c !== compact.current) { compact.current = c; el.classList.toggle('compact', c); }
  });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className={`site-head ${solid ? 'solid' : ''}`} ref={ref} data-mode="dark">
      <div className="ticker" aria-label="Cities we serve">
        <div className="cities">
          <div className="cities-run">
            {[0, 1].map(k => (
              <span key={k} className="cities-set" aria-hidden={k === 1 || undefined}>
                {CITIES.map(c => <span key={c}>{c}</span>)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="bar">
        <a className="wordmark" href="#top" aria-label="Garuda home" onClick={e => { e.preventDefault(); links[0]?.go(); }}>
          <span>G</span><span className="wm-rest">ARUDA</span>
        </a>
        <div className="menu-wrap">
          <button type="button" className="menu-btn" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen(o => !o)}>
            <span className="menu-dots" aria-hidden="true"><i /><i /><i /></span>{open ? 'CLOSE' : 'MENU'}
          </button>
          <nav id="site-menu" className={`menu ${open ? 'open' : ''}`} aria-label="Site" hidden={!open}>
            <ul>
              {links.map(l => (
                <li key={l.label}><button type="button" className={l.label === current ? 'cur' : ''} aria-current={l.label === current ? 'page' : undefined} onClick={() => { setOpen(false); l.go(); }}>{l.label}</button></li>
              ))}
            </ul>
          </nav>
        </div>
        <button type="button" className="pill-btn solid head-cta" onClick={onCta}><span>BOOK A SHIPMENT</span></button>
      </div>
    </header>
  );
}
