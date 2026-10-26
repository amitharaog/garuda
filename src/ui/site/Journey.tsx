/* The scroll journey: container loaded onto a truck → truck drives through the services → top-down road →
   onto the ship at sea → up through the clouds → the plane. Every frame is scrubbed by scroll position. */
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { CONTAINER, ContainerEnd, ContainerSide, Boom, PixelIcon, Plane, Ship, StackerBody, SvgDefs, TRUCK, TruckSide, TruckTop } from './art';
import type { IconName } from './art';
import { clamp, ease, lerp, seg, useScene } from './motion';

const GROUND = 760;
const PIVOT_Y = GROUND - 150;
const rad = (d: number) => (d * Math.PI) / 180;
const isPhone = (vw: number) => vw < 768;
/** On-screen length of the top-view truck, shared by the end of scene 1 and the start of scene 2. */
const topTruckPx = (vw: number) => Math.min(vw * (isPhone(vw) ? 0.86 : 0.62), 900);

function setT(el: Element | null | undefined, v: string) { if (el) el.setAttribute('transform', v); }
function css(el: HTMLElement | null | undefined, props: Record<string, string>) { if (el) for (const k in props) el.style.setProperty(k, props[k]); }

/* ======================= scene 1: load the container, drive through the services ======================= */
interface Service { icon: IconName; title: [string, string]; text: string; go: 'chat' | 'file' | 'rules' }
const SERVICES: Service[] = [
  { icon: 'chat', title: ['BOOK BY', 'CHAT'], text: 'Describe a shipment in plain words. Garuda fills what it can, asks only for what is missing, and confirms the booking.', go: 'chat' },
  { icon: 'file', title: ['CHECK A', 'FILE'], text: 'Upload the bookings workbook or two CSVs. Every booking is checked, fixed in one click and exported.', go: 'file' },
  { icon: 'check', title: ['10-RULE', 'RULEBOOK'], text: 'HS codes, declared value, carton maths, pallet weight, dangerous goods, delivery slots and ready dates.', go: 'rules' },
  { icon: 'truck', title: ['CARRIER', 'MATCH'], text: 'Cheapest, fastest, most reliable or balanced, chosen only from carriers that can take your pallet weight.', go: 'chat' },
  { icon: 'wrench', title: ['ONE-CLICK', 'FIXES'], text: 'Every issue arrives with its fix. Apply it and all ten checks re-run instantly, with undo one word away.', go: 'file' },
  { icon: 'invoice', title: ['INVOICE &', 'LABEL'], text: 'Draft a commercial invoice and a shipping label straight from the confirmed booking.', go: 'chat' },
];

export function JourneyLoad({ go }: { go: (v: 'chat' | 'file' | 'rules') => void }) {
  const r = {
    svg: useRef<SVGSVGElement | null>(null), cam: useRef<SVGGElement | null>(null), stack: useRef<SVGGElement | null>(null),
    truck: useRef<SVGGElement | null>(null), truckSquash: useRef<SVGGElement | null>(null), cont: useRef<SVGGElement | null>(null),
    contEnd: useRef<SVGGElement | null>(null), contSide: useRef<SVGGElement | null>(null), stacker: useRef<SVGGElement | null>(null),
    boom: useRef<SVGGElement | null>(null), spreader: useRef<SVGGElement | null>(null), spreaderBar: useRef<SVGGElement | null>(null),
    band: useRef<HTMLDivElement | null>(null), bandIn: useRef<HTMLDivElement | null>(null), track: useRef<HTMLDivElement | null>(null),
    big: useRef<HTMLDivElement | null>(null), kmh: useRef<HTMLSpanElement | null>(null), kmhWrap: useRef<HTMLDivElement | null>(null),
    top: useRef<HTMLDivElement | null>(null), topTruck: useRef<HTMLDivElement | null>(null), lanes: useRef<HTMLDivElement | null>(null),
  };
  const sw = [useRef<SVGGElement | null>(null), useRef<SVGGElement | null>(null)];
  const tw = [useRef<SVGGElement | null>(null), useRef<SVGGElement | null>(null), useRef<SVGGElement | null>(null), useRef<SVGGElement | null>(null), useRef<SVGGElement | null>(null)];
  const speed = useRef(0);

  const scene = useScene<HTMLElement>(({ p, vel, vw, vh, visible }) => {
    if (!visible) return;
    const s = Math.min(vw / 1600, vh / 900);
    const offY = vh - 900 * s;
    const phone = isPhone(vw);

    /* --- stacker + container kinematics --- */
    const a1 = ease.inOut(seg(p, 0, 0.08)), a3 = ease.inOut(seg(p, 0.11, 0.22)), a7 = ease.inOut(seg(p, 0.40, 0.48)), a8 = seg(p, 0.48, 0.58);
    let sx = lerp(150, 590, a1), ang = lerp(6, 27.8, a1), len = lerp(360, 441, a1);
    if (p > 0.11) { sx = lerp(590, 330, a3); ang = lerp(27.8, 40, a3); len = lerp(441, 470, a3); }
    if (p > 0.40) { sx = 330; ang = lerp(40, 19, a7); len = lerp(470, 381, a7); }
    if (p > 0.48) { sx = lerp(330, -1000, ease.in(a8)); ang = lerp(19, 30, ease.out(seg(a8, 0, 0.4))); len = 381; }
    const px = sx + 95;
    const tip = { x: px + len * Math.cos(rad(ang)), y: PIVOT_Y - len * Math.sin(rad(ang)) };
    setT(r.stacker.current, `translate(${sx} ${GROUND})`);
    setT(r.boom.current, `translate(${px} ${PIVOT_Y}) rotate(${-ang})`);
    r.boom.current?.querySelector('[data-tele]')?.setAttribute('width', String(Math.max(0, len - 240)));
    setT(r.spreader.current, `translate(${tip.x} ${tip.y})`);
    const stackerFade = 1 - seg(p, 0.52, 0.58);
    r.stacker.current?.setAttribute('opacity', String(stackerFade));
    r.boom.current?.setAttribute('opacity', String(stackerFade));
    r.spreader.current?.setAttribute('opacity', String(stackerFade));
    sw.forEach(w => setT(w.current, `rotate(${(sx / 46) * 57.3})`));

    /* --- truck --- */
    const x0 = lerp(1750, 485, ease.out(seg(p, 0.26, 0.40)));
    setT(r.truck.current, `translate(${x0} ${GROUND})`);
    const spin = p > 0.5 ? p * 9000 : ((x0 - 1750) / 34) * 57.3;
    tw.forEach(w => setT(w.current, `rotate(${spin})`));

    /* --- container: end view → long side (a fake 3D turn), carried by the spreader then the truck --- */
    const th = rad(90 * ease.inOut(seg(p, 0.15, 0.27)));
    const ew = CONTAINER.end * Math.cos(th), sdw = CONTAINER.side * Math.sin(th), total = ew + sdw;
    let cx: number, top: number;
    if (p < 0.08) { cx = 1000 + CONTAINER.end / 2; top = 440; }
    else if (p < 0.48) { cx = tip.x; top = tip.y + 36; }
    else { cx = x0 + 300; top = GROUND + TRUCK.deck - CONTAINER.h; }
    const left = cx - total / 2;
    setT(r.cont.current, `translate(${left} ${top})`);
    setT(r.contEnd.current, `scale(${Math.max(0.001, Math.cos(th))} 1)`);
    setT(r.contSide.current, `translate(${ew} 0) scale(${Math.max(0.001, Math.sin(th))} 1)`);
    r.contEnd.current?.setAttribute('opacity', th > 1.55 ? '0' : '1');
    // spreader width follows the face it is gripping
    const spw = p < 0.11 ? CONTAINER.end : Math.max(CONTAINER.end, total - 30);
    r.spreaderBar.current?.querySelectorAll('[data-bar]').forEach(n => n.setAttribute('width', String(spw)));
    r.spreaderBar.current?.querySelectorAll('[data-bar]').forEach(n => n.setAttribute('x', String(-spw / 2)));
    r.spreaderBar.current?.querySelector('[data-l]')?.setAttribute('x', String(-spw / 2 - 4));
    r.spreaderBar.current?.querySelector('[data-r]')?.setAttribute('x', String(spw / 2 - 4));

    /* --- stack pans out of shot --- */
    const pan = ease.in(seg(p, 0.22, 0.32));
    setT(r.stack.current, `translate(${pan * 900} 0)`);
    r.stack.current?.setAttribute('opacity', String(1 - pan));

    /* --- camera --- */
    const zA = phone ? 1.7 : 1;
    // On a phone the shot is tight, so the camera pans with the action: stacker → stack → truck.
    const fx = phone ? lerp(lerp(520, 900, ease.inOut(seg(p, 0, 0.1))), 820, ease.inOut(seg(p, 0.2, 0.4))) : 900;
    const camA = { z: zA, tx: 800 - fx * zA, ty: GROUND * (1 - zA) };
    const zB = Math.min(phone ? 2.2 : 1.28, (0.9 * vw) / (TRUCK.length * s));
    const yTarget = ((phone ? 0.36 : 0.42) * vh - offY) / s;
    const camB = { z: zB, tx: 800 - 887 * zB, ty: yTarget - GROUND * zB };
    const kb = ease.inOut(seg(p, 0.54, 0.64));
    const z = lerp(camA.z, camB.z, kb), tx = lerp(camA.tx, camB.tx, kb), ty = lerp(camA.ty, camB.ty, kb);
    setT(r.cam.current, `translate(${tx} ${ty}) scale(${z})`);

    /* --- band (the ground, then the services panel, then the road) --- */
    const groundY = offY + (GROUND * z + ty) * s;
    const k3 = ease.inOut(seg(p, 0.88, 0.97));
    const bandTop = lerp(groundY, 0, k3);
    css(r.band.current, { transform: `translate3d(0, ${bandTop.toFixed(1)}px, 0)` });
    const contentIn = seg(p, 0.58, 0.65), contentOut = seg(p, 0.86, 0.9);
    css(r.bandIn.current, { opacity: String(contentIn * (1 - contentOut)), transform: `translate3d(0, ${(1 - contentIn) * 40}px, 0)` });
    const tr = r.track.current;
    if (tr) {
      const max = Math.max(0, tr.scrollWidth - tr.parentElement!.clientWidth);
      tr.style.transform = `translate3d(${(-max * ease.sine(seg(p, 0.63, 0.86))).toFixed(1)}px,0,0)`;
    }

    /* --- big text + speedometer --- */
    const bigK = seg(p, 0.5, 0.92);
    css(r.big.current, { opacity: String(seg(p, 0.52, 0.6) * (1 - seg(p, 0.86, 0.9))), transform: `translate3d(${(20 - bigK * 120).toFixed(2)}%, 0, 0)` });
    speed.current = lerp(speed.current, Math.min(99, Math.abs(vel) * 1.6), 0.15);
    if (r.kmh.current) r.kmh.current.textContent = String(Math.round(speed.current)).padStart(2, '0');
    css(r.kmhWrap.current, { opacity: String(seg(p, 0.55, 0.6)) });

    /* --- tilt to top view --- */
    const squash = ease.inOut(seg(p, 0.88, 0.95));
    setT(r.truckSquash.current, `translate(0 ${GROUND}) scale(1 ${Math.max(0.02, 1 - squash)}) translate(0 ${-GROUND})`);
    r.truckSquash.current?.setAttribute('opacity', String(1 - seg(p, 0.92, 0.95)));
    const topIn = ease.out(seg(p, 0.92, 0.99));
    css(r.top.current, { opacity: String(seg(p, 0.9, 0.94)) });
    css(r.topTruck.current, { width: `${topTruckPx(vw)}px`, transform: `translate(-50%, -50%) scale(1, ${lerp(0.25, 1, topIn)})`, opacity: String(topIn) });
    css(r.lanes.current, { transform: `translate3d(${(-(p * 6000) % 240).toFixed(1)}px, 0, 0)` });
  });

  return (
    <section className="j1" ref={scene} data-header="light" id="services" aria-label="Services">
      <div className="stage">
        <div className="j1-kmh mono-s" ref={r.kmhWrap}><span ref={r.kmh}>00</span> KM/H</div>
        <div className="j1-big" ref={r.big} aria-hidden="true">OUR SERVICES</div>
        <svg ref={r.svg} className="j1-svg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
          <SvgDefs />
          <g ref={r.cam}>
            <g ref={r.stack}>
              <g transform="translate(1000 600)"><ContainerEnd tint="blue" label="GRDU 204118" /></g>
              <g transform="translate(1155 600)"><ContainerEnd tint="orange" label="GRDU 551027" /></g>
            </g>
            <g ref={r.truckSquash}>
              <g ref={r.truck}><TruckSide wheels={tw} /></g>
              <g ref={r.cont}>
                <g ref={r.contEnd}><ContainerEnd tint="white" label="GRDU 100260" /></g>
                <g ref={r.contSide}><ContainerSide tint="white" /></g>
              </g>
            </g>
            <g ref={r.boom}><BoomLive /></g>
            <g ref={r.stacker}><StackerBody wheels={[sw[0], sw[1]]} /></g>
            <g ref={r.spreader}><g ref={r.spreaderBar}><SpreaderLive /></g></g>
          </g>
        </svg>
        <div className="j1-band" ref={r.band} data-header="dark">
          <div className="j1-band-in" ref={r.bandIn}>
            <div className="j1-head">
              <h2 className="h2 two-tone"><span>EVERYTHING YOUR BOOKING NEEDS.</span> <span className="mute">UNDER ONE CHECK.</span></h2>
              <div className="j1-copy">
                <p>From the first message to the confirmed label, Garuda checks every detail that stops freight at the border or the dock.</p>
                <p>One console, one point of truth, and total visibility from collection to delivery.</p>
              </div>
            </div>
            <div className="j1-track-wrap">
              <div className="j1-track" ref={r.track}>
                {SERVICES.map(sv => (
                  <article className="svc" key={sv.title.join(' ')}>
                    <PixelIcon name={sv.icon} size={34} className="svc-ic" />
                    <h3 className="svc-t">{sv.title[0]}<br />{sv.title[1]}</h3>
                    <p>{sv.text}</p>
                    <button type="button" className="pill-btn small" onClick={() => go(sv.go)}><span>OPEN</span></button>
                  </article>
                ))}
              </div>
            </div>
          </div>
          <div className="j1-top" ref={r.top} aria-hidden="true">
            <div className="lanes" ref={r.lanes} />
            <div className="top-truck" ref={r.topTruck}><svg viewBox="-350 -75 700 150"><TruckTop /></svg></div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Boom with a telescopic section whose width the scene sets directly. */
function BoomLive() {
  return (
    <g>
      <Boom len={240} />
      <rect data-tele x={236} y={-12} width={150} height={24} fill="#4a525c" />
    </g>
  );
}
function SpreaderLive() {
  return (
    <g>
      <rect x={-16} y={-6} width={32} height={22} fill="#23282e" rx={3} />
      <rect data-bar x={-75} y={16} width={150} height={18} fill="#1d2228" />
      <rect data-bar x={-75} y={16} width={150} height={6} fill="url(#hazard)" />
      <rect data-l x={-79} y={14} width={8} height={24} fill="#e9b52f" />
      <rect data-r x={71} y={14} width={8} height={24} fill="#e9b52f" />
    </g>
  );
}

/* ======================= scene 2: road → ship → sea → clouds ======================= */
/** The truck keeps left: north lane heading east, then the east lane heading south. */
const LANE = 'M -420 145 H 615 Q 735 145 735 265 V 1700';
const ROADS = ['M -520 180 H 2200', 'M 700 180 V 3400'];
/** Rounded inner corners of the T-junction. */
const FILLETS = ['M 545 255 H 625 V 335 A 80 80 0 0 0 545 255 Z', 'M 855 255 H 775 V 335 A 80 80 0 0 1 855 255 Z'];

interface Feat { icon: IconName; title: [string, string]; text: ReactNode }
const RELIABILITY: Feat[] = [
  { icon: 'clock', title: ['LIVE', 'RE-CHECKS'], text: <>Every change, typed or edited, re-runs all ten rules. Live visibility means <em>faster decisions</em> and zero <em>guesswork</em>.</> },
  { icon: 'globe', title: ['THREE LANES,', 'ONE VIEW'], text: <>Germany, France and the Netherlands, with every carrier on the lane compared <em>side by side</em>.</> },
  { icon: 'shield', title: ['CARRIER', 'FALLBACK'], text: <>If the first-choice carrier can’t take the pallet weight, Garuda moves to the next one that can, and <em>says why</em>.</> },
];
const WHY: Feat[] = [
  { icon: 'contact', title: ['ONE POINT OF', 'CONTACT'], text: 'No more chasing spreadsheets. One console takes the booking from first message to confirmed label.' },
  { icon: 'globe', title: ['FULL RULE', 'VISIBILITY'], text: 'See every rule that passed or failed, and exactly what protects customs, the carrier and the warehouse.' },
  { icon: 'shield', title: ['CUSTOMS-READY', 'DATA'], text: 'HS codes, origins and declared values checked against the rulebook before anything is sent.' },
  { icon: 'pound', title: ['TRANSPARENT', 'PRICING'], text: 'Price per pallet × pallets, transit days and on-time rate, laid out for every carrier on the lane.' },
  { icon: 'arrows', title: ['FAST ISSUE', 'RESOLUTION'], text: 'When something is wrong, Garuda doesn’t point fingers. It shows the fix and re-checks the booking at once.' },
];

export function JourneySea() {
  const road = useRef<SVGPathElement | null>(null);
  const r = {
    world: useRef<HTMLDivElement | null>(null), truck: useRef<SVGGElement | null>(null), black: useRef<HTMLDivElement | null>(null),
    copy: useRef<HTMLDivElement | null>(null), feats: useRef<HTMLDivElement | null>(null),
    sea: useRef<HTMLDivElement | null>(null), ship: useRef<HTMLDivElement | null>(null), ocean: useRef<HTMLDivElement | null>(null), oceanTex: useRef<HTMLDivElement | null>(null),
    why: useRef<HTMLDivElement | null>(null), clouds: useRef<HTMLDivElement | null>(null), white: useRef<HTMLDivElement | null>(null),
  };
  const fw = useRef<Array<HTMLDivElement | null>>([]);
  const len = useRef(0);
  useEffect(() => { if (road.current) len.current = road.current.getTotalLength(); }, []);

  const scene = useScene<HTMLElement>(({ p, vw, vh, t, visible }) => {
    if (!visible || !road.current) return;
    const phone = isPhone(vw);
    const R = seg(p, 0, 0.44);

    /* --- road --- */
    const L = len.current || road.current.getTotalLength();
    const d = L * (0.06 + 0.94 * ease.inOut(seg(R, 0, 1)));
    const pt = road.current.getPointAtLength(d), pt2 = road.current.getPointAtLength(Math.min(L, d + 2));
    const heading = (Math.atan2(pt2.y - pt.y, pt2.x - pt.x) * 180) / Math.PI;
    setT(r.truck.current, `translate(${pt.x} ${pt.y}) rotate(${heading}) scale(0.38)`);
    const z0 = topTruckPx(vw) / (680 * 0.38);
    const z1 = phone ? 0.62 : clamp(vh / 1050, 0.72, 1.05);
    const e = ease.inOut(seg(R, 0, 0.3));
    const z = lerp(z0, z1, e);
    const cx = lerp(pt.x, 700, e), cy = lerp(pt.y, Math.max(pt.y, phone ? 520 : 400), e);
    const ax = vw * (phone ? 0.5 : 0.5), ay = vh * (phone ? 0.42 : 0.5);
    css(r.world.current, { transform: `translate3d(${(ax - cx * z).toFixed(1)}px, ${(ay - cy * z).toFixed(1)}px, 0) scale(${z.toFixed(4)})` });
    css(r.black.current, { opacity: String(1 - seg(R, 0, 0.1)) });
    const ci = seg(R, 0.2, 0.32);
    css(r.copy.current, { opacity: String(ci), transform: `translate3d(0, ${(1 - ease.out(ci)) * 40}px, 0)` });
    const fl = r.feats.current;
    if (fl) {
      const h = fl.scrollHeight;
      const y = lerp(vh * 0.85, -h + vh * 0.15, seg(R, 0.24, 1));
      fl.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
    }

    /* --- sea --- */
    const sIn = ease.out(seg(p, 0.42, 0.5));
    css(r.sea.current, { transform: `translate3d(0, ${((1 - sIn) * 100).toFixed(2)}%, 0)` });
    const H = vh * (phone ? 0.84 : 0.92);
    const shipW = (H * 260) / 1080;
    const zDeck = (vw * 1.25) / shipW;
    const zk = ease.inOut(seg(p, 0.48, 0.6));
    const shrink = ease.inOut(seg(p, 0.81, 0.95));
    const zs = lerp(zDeck, 1, zk) * lerp(1, 0.28, shrink);
    const bob = Math.sin(t * 0.6) * 0.6;
    const drift = -seg(p, 0.48, 1) * vh * 0.06;
    css(r.ship.current, {
      height: `${H}px`,
      transform: `translate(-50%, calc(-50% + ${drift.toFixed(1)}px)) scale(${zs.toFixed(4)}) rotate(${bob.toFixed(2)}deg)`,
      filter: shrink > 0.01 ? `blur(${(shrink * 2.5).toFixed(2)}px)` : 'none',
    });
    css(r.ocean.current, { transform: `scale(${lerp(1.6, 1, zk).toFixed(3)})` });
    css(r.oceanTex.current, { transform: `translate3d(0, ${(((p * 900) % 420) - 420).toFixed(1)}px, 0)` });
    const wIn = seg(p, 0.58, 0.63), wOut = seg(p, 0.8, 0.84);
    css(r.why.current, { opacity: String(wIn * (1 - wOut)), transform: `translate(-50%, calc(-50% + ${((1 - wIn) * 30).toFixed(1)}px))` });
    fw.current.forEach((el, i) => {
      if (!el) return;
      const a = i < 4 ? 0.62 + i * 0.025 : 0.88;
      const o = i < 4 ? seg(p, a, a + 0.04) * (1 - seg(p, 0.8, 0.84)) : seg(p, a, a + 0.03) * (1 - seg(p, 0.95, 0.98));
      el.style.opacity = String(o);
      el.style.transform = `translate3d(0, ${((1 - o) * 24).toFixed(1)}px, 0)`;
    });
    const cl = seg(p, 0.82, 1);
    css(r.clouds.current, { opacity: String(ease.in(cl) * 1.2), transform: `scale(${lerp(1.5, 1, ease.out(cl)).toFixed(3)})` });
    css(r.white.current, { opacity: String(seg(p, 0.95, 1)) });
  });

  return (
    <section className="j2" ref={scene} data-header="light" aria-label="Reliability and why Garuda">
      <div className="stage">
        <div className="road-layer">
          <div className="road-world" ref={r.world}>
            <svg width="1600" height="1600" viewBox="0 0 1600 1600" aria-hidden="true">
              {ROADS.map(dd => <path key={dd} d={dd} stroke="#111" strokeWidth={150} fill="none" />)}
              {FILLETS.map(dd => <path key={dd} d={dd} fill="#111" />)}
              <path d="M -520 180 H 610 M 790 180 H 2200" stroke="#3c3c3c" strokeWidth={3} strokeDasharray="26 30" fill="none" />
              <path d="M 700 290 V 3400" stroke="#3c3c3c" strokeWidth={3} strokeDasharray="26 30" fill="none" />
              <g transform="translate(800 196)">
                <path d="M0 0 L120 0 L0 52 Z" fill="none" stroke="#5a5a5a" strokeWidth={2} />
                {[20, 40, 60, 80, 100].map(x => <line key={x} x1={x} y1={0} x2={x * 0.45} y2={52 - x * 0.43} stroke="#5a5a5a" strokeWidth={2} />)}
              </g>
              <path ref={road} d={LANE} fill="none" stroke="none" />
              <g ref={r.truck}><TruckTop /></g>
            </svg>
          </div>
          <div className="road-copy" ref={r.copy}>
            <h2 className="h2 two-tone"><span className="mute">RELIABILITY</span> <span>AT EVERY MILESTONE</span></h2>
            <p>With every check under one roof and one accountable console, your bookings move the way your business demands: predictably, transparently, and without <em>excuses</em>.</p>
          </div>
          <div className="road-feats-clip">
            <div className="road-feats" ref={r.feats}>
              {RELIABILITY.map(f => (
                <div className="feat" key={f.title.join(' ')}>
                  <PixelIcon name={f.icon} size={30} />
                  <h3 className="h6">{f.title[0]}<br />{f.title[1]}</h3>
                  <p>{f.text}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="road-black" ref={r.black} />
        </div>

        <div className="sea-layer" ref={r.sea} data-header="dark">
          <div className="ocean" ref={r.ocean}><div className="ocean-tex" ref={r.oceanTex} /></div>
          <div className="ship" ref={r.ship}><svg viewBox="-130 -540 260 1080" aria-hidden="true"><Ship /></svg></div>
          <div className="why" ref={r.why}>
            <span className="mono-s">WHY US</span>
            <h2 className="h2">LOGISTICS THAT WORKS AS HARD AS YOU DO.</h2>
          </div>
          <div className="why-feats">
            {WHY.map((f, i) => (
              <div className={`wf wf-${i}`} key={f.title.join(' ')} ref={el => { fw.current[i] = el; }}>
                <PixelIcon name={f.icon} size={30} />
                <h3 className="h6">{f.title[0]}<br />{f.title[1]}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
          <div className="clouds" ref={r.clouds} aria-hidden="true">{CLOUD_BLOBS}</div>
          <div className="sea-white" ref={r.white} />
        </div>
      </div>
    </section>
  );
}

const CLOUD_BLOBS = [
  [8, 20, 60], [30, 8, 50], [70, 12, 58], [92, 30, 52], [10, 70, 64], [40, 88, 56], [75, 82, 60], [95, 70, 48], [50, 50, 30], [25, 45, 40], [80, 48, 40],
].map(([x, y, s], i) => <i key={i} style={{ left: `${x}%`, top: `${y}%`, width: `${s}vmax`, height: `${s * 0.7}vmax` }} />);

/* ======================= scene 3: through the clouds to the plane ======================= */
export function JourneySky() {
  const r = {
    white: useRef<HTMLDivElement | null>(null), sky: useRef<HTMLDivElement | null>(null), left: useRef<HTMLDivElement | null>(null),
    right: useRef<HTMLDivElement | null>(null), plane: useRef<HTMLDivElement | null>(null),
  };
  const scene = useScene<HTMLElement>(({ p, vw, vh, t, visible }) => {
    if (!visible) return;
    const phone = isPhone(vw);
    css(r.white.current, { opacity: String(1 - seg(p, 0, 0.12)) });
    const part = ease.inOut(seg(p, 0.05, 0.42));
    css(r.left.current, { transform: `translate3d(${(-part * 70).toFixed(2)}%, 0, 0) scale(${lerp(1, 1.3, part).toFixed(3)})`, opacity: String(1 - seg(p, 0.3, 0.48)) });
    css(r.right.current, { transform: `translate3d(${(part * 70).toFixed(2)}%, 0, 0) scale(${lerp(1, 1.3, part).toFixed(3)})`, opacity: String(1 - seg(p, 0.3, 0.48)) });
    css(r.sky.current, { opacity: String(1 - seg(p, 0.36, 0.55)) });
    const size = Math.min(vw * (phone ? 1.25 : 0.62), vh * 1.05);
    const enter = ease.out(seg(p, 0.04, 0.5));
    const exit = ease.inOut(seg(p, 0.5, 1));
    const y = lerp(vh * 0.95, vh * 0.2, enter) - exit * vh * 0.42;
    const sc = lerp(1.35, 1, enter);
    const sway = Math.sin(t * 0.7) * 0.8;
    css(r.plane.current, { width: `${size}px`, transform: `translate(-50%, ${(y - size / 2).toFixed(1)}px) scale(${sc.toFixed(3)}) rotate(${sway.toFixed(2)}deg)` });
  });
  return (
    <section className="j3" ref={scene} data-header="light" aria-hidden="true">
      <div className="stage">
        <div className="sky" ref={r.sky} />
        <div className="cloudbank left" ref={r.left}>{CLOUD_BLOBS.slice(0, 6)}</div>
        <div className="cloudbank right" ref={r.right}>{CLOUD_BLOBS.slice(5)}</div>
        <div className="plane" ref={r.plane}><svg viewBox="-500 -520 1000 1040"><Plane /></svg></div>
        <div className="sky-white" ref={r.white} />
      </div>
    </section>
  );
}
