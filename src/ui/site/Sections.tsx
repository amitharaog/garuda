/* Static and lightly animated sections: hero, intro + stats, cases, carriers grid, rules band, FAQ, footer. */
import { useState } from 'react';
import type { ReactNode } from 'react';
import { ALLOWED, CARRIERS, PROTECTS, RULES } from '../../domain';
import { Globe } from './Globe';
import { Reveal } from './Reveal';
import { ease, seg, useScene } from './motion';
import { PixelIcon } from './art';
import type { IconName } from './art';

export function PillBtn({ children, onClick, solid, dark }: { children: ReactNode; onClick?: () => void; solid?: boolean; dark?: boolean }) {
  return <button type="button" className={`pill-btn ${solid ? 'solid' : ''} ${dark ? 'on-light' : ''}`} onClick={onClick}><span>{children}</span></button>;
}

/* ---------------- hero ---------------- */
export function Hero({ onChat, onFile }: { onChat: () => void; onFile: () => void }) {
  const inner = useScene<HTMLElement>(({ p }) => {
    const el = inner.current;
    if (!el) return;
    const k = ease.out(seg(p, 0, 0.5));
    el.style.setProperty('--hp', k.toFixed(4));
  });
  return (
    <section className="hero" id="top" data-header="dark" ref={inner} aria-labelledby="hero-title">
      <div className="hero-stage">
        <div className="hero-stars" aria-hidden="true" />
        <div className="hero-globe"><Globe /></div>
        <div className="hero-copy">
          <h1 className="h1" id="hero-title">
            <span className="line"><span>CATCH IT</span></span>
            <span className="line"><span>BEFORE IT</span></span>
            <span className="line"><span>SHIPS</span></span>
          </h1>
          <p className="hero-sub">Book UK → Germany, France and Netherlands road freight by chat, or drop in a file.</p>
          <div className="hero-btns">
            <PillBtn solid onClick={onChat}>BOOK BY CHAT</PillBtn>
            <PillBtn onClick={onFile}>CHECK A FILE</PillBtn>
          </div>
        </div>
      </div>
      <div className="hero-tail" aria-hidden="true" />
    </section>
  );
}

/* ---------------- intro + stats ---------------- */
function Counter({ to, suffix = '' }: { to: number; suffix?: string }) {
  const ref = useScene<HTMLSpanElement>(({ vh }) => {
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const k = ease.out(seg(1 - top / vh, 0.05, 0.45));
    el.textContent = Math.round(to * k).toLocaleString('en-GB') + suffix;
  }, 'view');
  return <span ref={ref}>0{suffix}</span>;
}

export function Intro({ onRules }: { onRules: () => void }) {
  return (
    <section className="intro" data-header="light" id="how">
      <div className="intro-grid">
        <div className="intro-l">
          <div className="intro-img" aria-hidden="true"><Interchange /></div>
          <Reveal className="h2" pre="WE READ BOOKINGS." text="WE CATCH THE MISTAKES." />
        </div>
        <div className="intro-r">
          <Reveal as="p" by="word" className="lead" text="With every check under one roof and one accountable console, your bookings move the way your business demands: predictably, transparently, and without surprises." />
          <Reveal as="p" by="word" className="lead" text="That means no customs holds over a missing HS code. No pallets refused at the dock. Just one checker, accountable from collection to delivery." />
          <PillBtn dark onClick={onRules}>READ THE RULEBOOK</PillBtn>
          <div className="stats-list">
            <div className="stat-row"><b className="h0"><Counter to={10} /></b><span>Rulebook checks on every booking</span></div>
            <div className="stat-row"><b className="h0"><Counter to={3} /></b><span>Carriers compared per route</span></div>
            <div className="stat-row"><b className="h0"><Counter to={ALLOWED.originCity.length + ALLOWED.destCountry.reduce((n, c) => n + ALLOWED.destCities[c].length, 0)} /></b><span>Cities served across the UK, Germany, France and the Netherlands</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Monochrome aerial interchange, drawn in place of a photo. */
function Interchange() {
  return (
    <svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice">
      <rect width="400" height="260" fill="#5b6157" />
      <path d="M0 0 H400 V260 H0 Z" fill="url(#ig-n)" opacity=".5" />
      <defs>
        <filter id="ig-f"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="3" /><feColorMatrix values="0 0 0 0 .2  0 0 0 0 .3  0 0 0 0 .2  0 0 0 .55 0" /></filter>
        <pattern id="ig-n" width="400" height="260" patternUnits="userSpaceOnUse"><rect width="400" height="260" filter="url(#ig-f)" /></pattern>
      </defs>
      {[
        'M-20 210 C 80 210, 90 60, 170 60 S 260 230, 330 210 S 380 40, 430 40',
        'M-20 170 C 60 170, 110 20, 190 30 S 270 190, 340 170 S 400 0, 440 10',
        'M60 280 C 60 180, 140 140, 200 140 S 320 100, 330 -20',
        'M120 290 C 130 200, 220 190, 240 120 S 300 30, 260 -20',
      ].map((d, i) => (
        <g key={i}>
          <path d={d} stroke="#3c403b" strokeWidth="26" fill="none" />
          <path d={d} stroke="#a7aaa4" strokeWidth="22" fill="none" />
          <path d={d} stroke="#fff" strokeWidth="1" strokeDasharray="6 8" fill="none" opacity=".75" />
        </g>
      ))}
      {[[60, 190], [150, 68], [230, 160], [300, 200], [205, 135], [110, 118]].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="9" height="5" rx="1" fill={i % 2 ? '#e8e8e8' : '#20232a'} transform={`rotate(${i * 25} ${x} ${y})`} />
      ))}
    </svg>
  );
}

/* ---------------- cases (the plane flies over this heading) ---------------- */
export function Cases() {
  return (
    <section className="cases" data-header="light" id="cases">
      <h2 className="h1 two-tone"><span>CAUGHT BEFORE</span> <span className="mute">IT SHIPPED</span></h2>
    </section>
  );
}

/* ---------------- carriers grid (partners) ---------------- */
export function Carriers() {
  const carriers = Array.from(new Map(CARRIERS.map(c => [c.carrier, c])).values());
  const lanes = ALLOWED.destCountry;
  const cell = (k: string, body: ReactNode) => <div className="gcell" key={k}><i className="tick tl" /><i className="tick tr" /><i className="tick bl" /><i className="tick br" />{body}</div>;
  return (
    <section className="partners" data-header="light" id="carriers">
      <div className="pgrid">
        <div className="pgrid-label"><span className="mono-s">Our carriers</span><span className="h6">ROAD FREIGHT</span></div>
        {carriers.map(c => cell(c.carrier, (
          <div className="pcell">
            <b className="pname">{c.carrier.replace('Carrier ', 'CARRIER ')}</b>
            <span>{c.service}</span>
            <span className="mono-s">{c.transit} DAYS · {c.ontime}% ON TIME · {c.maxKg} KG/PALLET</span>
          </div>
        )))}
        <div className="pgrid-label"><span className="mono-s">Our lanes</span><span className="h6">DESTINATIONS</span></div>
        {lanes.map(d => cell(d, (
          <div className="pcell">
            <b className="pname">{d.toUpperCase()}</b>
            <span>{ALLOWED.destCities[d].join(' · ')}</span>
            <span className="mono-s">FROM {ALLOWED.originCity.join(' · ').toUpperCase()}</span>
          </div>
        )))}
      </div>
    </section>
  );
}

/* ---------------- rules band (insights) ---------------- */
export function RulesBand({ onAll }: { onAll: () => void }) {
  return (
    <section className="ins" data-header="dark" id="rules-band">
      <div className="ins-glow" aria-hidden="true" />
      <div className="ins-grid">
        <div className="ins-l">
          <h2 className="h2 two-tone"><span className="mute">WHAT GETS CHECKED</span> <span>ON EVERY BOOKING</span></h2>
          <p>Stay ahead of the mistakes that stop freight at the border, from short HS codes to overweight pallets and missing delivery slots.</p>
          <PillBtn onClick={onAll}>VIEW ALL</PillBtn>
        </div>
        <div className="ins-r">
          <div className="ins-track">
            {RULES.map(r => (
              <article className="ins-card" key={r.id}>
                <div className="ins-thumb" aria-hidden="true"><span>{r.id}</span></div>
                <span className="mono-s">{PROTECTS[r.id].toUpperCase()} &nbsp;|&nbsp; {r.severity === 'Red' ? 'MUST FIX' : 'RISKY'}</span>
                <h3>{r.text}</h3>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- FAQ ---------------- */
const FAQS: Array<[string, string]> = [
  ['What does Garuda do?', 'It checks UK → EU road freight bookings before they ship. Describe a shipment in chat or upload a workbook; every booking is checked against the 10-rule rulebook, matched to a carrier and confirmed in one place.'],
  ['Which routes do you cover?', 'Road freight from London, Manchester, Birmingham and Leeds to Germany (Berlin, Frankfurt, Hamburg), France (Paris, Lyon) and the Netherlands (Amsterdam, Rotterdam).'],
  ['How is the carrier chosen?', 'By your priority: cheapest is lowest price × pallets, fastest is shortest transit, most reliable is the highest on-time rate, and balanced picks the best worst-case score. Only carriers that can take your pallet weight are eligible.'],
  ['What is a red or amber result?', 'Red means the shipment must not go until it is fixed. Amber is risky: fix it or check it. Each issue comes with the fix, usually one click away.'],
  ['Can I check a whole file?', 'Yes. Upload the bookings workbook (Bookings + Items sheets) or two CSVs. Every booking is checked, can be fixed in one click, and exports as a corrected workbook plus an issues report.'],
  ['Do I need an account?', 'No. Everything runs in your browser: no login, no API key and no backend. The same input always gives the same result.'],
  ['Can I change a booking after it is checked?', 'Any time. Say “add a pallet” or “change destination to Paris”, or edit the field in the booking panel; the checks re-run instantly, and “undo” steps back.'],
  ['Does it draft documents?', 'It drafts a commercial invoice and a shipping label from the booking, ready to review before you send anything.'],
];

export function Faq({ onChat }: { onChat: () => void }) {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <section className="faq" data-header="light" id="faq">
      <div className="faq-l">
        <h2 className="h2">F.A.Q</h2>
        <p>Straightforward answers, so you can move forward with confidence.</p>
      </div>
      <ol className="faq-list">
        {FAQS.map(([q, a], i) => (
          <li key={q} className={open === i ? 'open' : ''}>
            <button type="button" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
              <span className="mono-s">{String(i + 1).padStart(2, '0')}</span>
              <span className="q">{q}</span>
              <span className="plus" aria-hidden="true" />
            </button>
            <div className="a"><div><p>{a}</p></div></div>
          </li>
        ))}
      </ol>
      <div className="faq-r">
        <p>Still have questions? The booking assistant is here to help.</p>
        <button type="button" className="mono-link" onClick={onChat}>ASK IN CHAT</button>
      </div>
    </section>
  );
}

/* ---------------- footer ---------------- */
const MARQUEE = ['Manchester → Frankfurt', 'Leeds → Lyon', 'London → Amsterdam', 'Birmingham → Hamburg', 'Birmingham → Paris', 'Leeds → Rotterdam', 'London → Berlin', 'Manchester → Paris'];
const ICON_ROW: IconName[] = ['chat', 'file', 'check', 'truck'];

export function Footer({ links, current, onChat, cta = true }: { links: Array<{ label: string; go: () => void }>; current: string; onChat: () => void; cta?: boolean }) {
  return (
    <footer className="foot">
      {cta && <div className="foot-cta" data-header="dark">
        <div className="rings" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map(i => <i key={i} />)}</div>
        <div className="foot-cta-in">
          <div className="foot-icons" aria-hidden="true">{ICON_ROW.map(n => <PixelIcon key={n} name={n} size={26} />)}</div>
          <h2 className="h1"><span className="mute">READY TO</span> SHIP?</h2>
          <p>No forms to chase. No runaround. Just a checker that tells you what to fix, and how.</p>
          <PillBtn onClick={onChat}>BOOK BY CHAT</PillBtn>
        </div>
      </div>}
      <div className="foot-main" data-header="light">
        <p className="foot-tag">One checker.<br />Every booking caught.</p>
        <div className="foot-cols">
          <div>
            <span className="mono-s">ROUTES</span>
            <ul className="foot-routes">{['UK → DE', 'UK → FR', 'UK → NL'].map(r => <li key={r}>{r}</li>)}</ul>
          </div>
          <div>
            <span className="mono-s">PRODUCT</span>
            <ul className="foot-links">{links.map(l => <li key={l.label}><button type="button" className={l.label === current ? 'cur' : ''} onClick={l.go}>{l.label}</button></li>)}</ul>
          </div>
          <div>
            <span className="mono-s">YOUR DATA</span>
            <p>Everything runs in your browser. Files never leave your device, and the same input always gives the same result.</p>
          </div>
        </div>
        <div className="foot-tabs"><span>ROUTES</span><span>RULES</span></div>
        <div className="marquee" aria-hidden="true">
          <div className="marquee-run">{[...MARQUEE, ...MARQUEE].map((m, i) => <span key={i}>{m}<i>·</i></span>)}</div>
        </div>
        <div className="foot-legal mono-s">
          <span>© {new Date().getFullYear()} GARUDA · UK → EU ROAD FREIGHT</span>
          <span>OPS HACKATHON · CASE 2</span>
        </div>
        <div className="foot-word" aria-hidden="true">GARUDA</div>
      </div>
    </footer>
  );
}
