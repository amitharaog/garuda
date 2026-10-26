/* Original vector artwork for the journey scenes: reach stacker, containers, truck (side and top), ship, plane, pixel icons. */
import type { ReactNode, Ref } from 'react';

/* ---------- containers ---------- */
export const CONTAINER = { end: 150, side: 540, h: 160 };
export type Tint = 'white' | 'blue' | 'orange';
const TINT: Record<Tint, [string, string, string]> = {
  //            face       rib/shade  rail
  white: ['#eceef1', '#c6cbd2', '#a9afb8'],
  blue: ['#1d3f8c', '#15306c', '#0f2552'],
  orange: ['#d8642c', '#b24f20', '#8d3d18'],
};

/** Door end of a container, origin top-left. */
export function ContainerEnd({ tint, label }: { tint: Tint; label?: string }) {
  const [f, s, r] = TINT[tint];
  const w = CONTAINER.end, h = CONTAINER.h;
  return (
    <g>
      <rect width={w} height={h} fill={f} />
      <rect width={w} height={9} fill={r} />
      <rect y={h - 9} width={w} height={9} fill={r} />
      <rect width={7} height={h} fill={r} />
      <rect x={w - 7} width={7} height={h} fill={r} />
      <line x1={w / 2} y1={9} x2={w / 2} y2={h - 9} stroke={s} strokeWidth={2} />
      {[22, 52, 98, 128].map(x => <rect key={x} x={x - 2} y={14} width={4} height={h - 28} fill={s} rx={2} />)}
      {[22, 52, 98, 128].map(x => <rect key={'h' + x} x={x - 5} y={h / 2 - 4} width={10} height={8} fill={r} rx={1.5} />)}
      {label && <text x={w / 2 - 34} y={30} fontSize={8} fill={s} fontFamily="monospace">{label}</text>}
      {[0, w - 12].map(x => [0, h - 12].map(y => <rect key={`${x}-${y}`} x={x} y={y} width={12} height={12} fill={r} />))}
    </g>
  );
}

/** Long side of a container, origin top-left. */
export function ContainerSide({ tint, w = CONTAINER.side }: { tint: Tint; w?: number }) {
  const [f, s, r] = TINT[tint];
  const h = CONTAINER.h;
  const ribs: ReactNode[] = [];
  for (let x = 16; x < w - 12; x += 11) ribs.push(<rect key={x} x={x} y={12} width={4.5} height={h - 24} fill={s} />);
  return (
    <g>
      <rect width={w} height={h} fill={f} />
      {ribs}
      <rect width={w} height={10} fill={r} />
      <rect y={h - 10} width={w} height={10} fill={r} />
      <rect width={12} height={h} fill={r} />
      <rect x={w - 12} width={12} height={h} fill={r} />
      {[0, w - 14].map(x => [0, h - 13].map(y => <rect key={`${x}-${y}`} x={x} y={y} width={14} height={13} fill={s} />))}
    </g>
  );
}

/* ---------- wheels ---------- */
export function Wheel({ r, wref }: { r: number; wref?: Ref<SVGGElement> }) {
  return (
    <g>
      <circle r={r} fill="#16181b" />
      <circle r={r * 0.62} fill="#2a2e33" />
      <g ref={wref}>
        <circle r={r * 0.5} fill="#8d939b" />
        {[0, 72, 144, 216, 288].map(a => (
          <circle key={a} cx={Math.cos((a * Math.PI) / 180) * r * 0.32} cy={Math.sin((a * Math.PI) / 180) * r * 0.32} r={r * 0.07} fill="#3d4248" />
        ))}
        <rect x={-r * 0.06} y={-r * 0.5} width={r * 0.12} height={r * 0.2} fill="#5b6168" />
      </g>
      <circle r={r * 0.16} fill="#4a4f56" />
    </g>
  );
}

/* ---------- reach stacker (side view, facing right; origin = rear wheel ground line, x=0 at the rear) ---------- */
export const STACKER = { pivot: { x: 95, y: -150 }, len: 390 };
const TEAL = '#2b9cb8', TEAL_D = '#1f7891', TEAL_L = '#55b9d1';

export function StackerBody({ wheels }: { wheels?: [Ref<SVGGElement>, Ref<SVGGElement>] }) {
  return (
    <g>
      {/* counterweight */}
      <path d="M0 -60 L0 -150 Q0 -162 12 -162 L118 -162 Q128 -162 128 -150 L128 -60 Z" fill={TEAL} />
      <rect x={6} y={-150} width={10} height={80} fill={TEAL_D} />
      {/* chassis */}
      <path d="M90 -42 L90 -112 L360 -112 Q380 -112 386 -96 L392 -60 L392 -42 Z" fill={TEAL} />
      <rect x={128} y={-112} width={262} height={10} fill={TEAL_L} />
      <rect x={110} y={-66} width={270} height={14} fill={TEAL_D} />
      {/* engine grille */}
      {[0, 1, 2, 3].map(i => <rect key={i} x={18 + i * 22} y={-104} width={14} height={30} fill={TEAL_D} rx={2} />)}
      {/* cab */}
      <path d="M180 -112 L180 -236 Q180 -246 190 -246 L262 -246 Q272 -246 274 -236 L284 -112 Z" fill={TEAL} />
      <path d="M190 -124 L190 -232 L262 -232 L272 -124 Z" fill="#20323d" />
      <path d="M232 -232 L262 -232 L271 -140 L246 -140 Z" fill="#3f5866" opacity={0.6} />
      <rect x={186} y={-250} width={92} height={8} fill={TEAL_D} rx={3} />
      <rect x={196} y={-128} width={70} height={4} fill="#111" opacity={0.35} />
      {/* steps + light */}
      <rect x={200} y={-60} width={34} height={6} fill="#20323d" />
      <rect x={384} y={-100} width={10} height={14} fill="#f6c84a" rx={2} />
      {/* wheel arches */}
      <path d="M22 -42 A54 54 0 0 1 128 -42 Z" fill="#14272e" />
      <path d="M256 -42 A54 54 0 0 1 362 -42 Z" fill="#14272e" />
      <g transform="translate(75,-46)"><Wheel r={46} wref={wheels?.[0]} /></g>
      <g transform="translate(309,-46)"><Wheel r={46} wref={wheels?.[1]} /></g>
      <text x={150} y={-80} fontSize={9} fill="#d6eef4" fontFamily="'Space Mono', monospace" letterSpacing={1}>GARUDA HANDLING</text>
    </g>
  );
}

/** Telescopic boom drawn along +x from the pivot. `len` is the current length. */
export function Boom({ len }: { len: number }) {
  const outer = Math.min(len, STACKER.len * 0.62);
  return (
    <g>
      <path d={`M0 -18 L${outer} -15 L${outer} 15 L0 18 Z`} fill="#2f353d" />
      <rect x={outer - 4} y={-12} width={len - outer + 4} height={24} fill="#4a525c" />
      <rect x={8} y={-6} width={outer - 16} height={3} fill="#5c6670" opacity={0.7} />
      <text x={40} y={4} fontSize={9} fill="#9aa5b1" fontFamily="'Space Mono', monospace" letterSpacing={2}>GARUDA · 45T</text>
      <circle r={14} fill="#1d2228" />
      <circle r={6} fill="#6b737c" />
    </g>
  );
}

export function SvgDefs() {
  return (
    <defs>
      <pattern id="hazard" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="14" height="14" fill="#f2c230" />
        <rect width="7" height="14" fill="#1b1b1b" />
      </pattern>
      <linearGradient id="cabShine" x1="0" x2="1">
        <stop offset="0" stopColor="#2b2f35" />
        <stop offset=".55" stopColor="#3b4047" />
        <stop offset="1" stopColor="#1a1c20" />
      </linearGradient>
      <linearGradient id="glass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#5e7280" />
        <stop offset="1" stopColor="#1c252c" />
      </linearGradient>
    </defs>
  );
}

/* ---------- truck, side view (facing right; origin = trailer rear at ground) ---------- */
export const TRUCK = { deck: -78, trailer: 600, length: 805 };

export function TruckSide({ wheels }: { wheels?: Array<Ref<SVGGElement>> }) {
  const w = (i: number) => wheels?.[i];
  return (
    <g>
      {/* trailer chassis */}
      <rect x={0} y={-78} width={600} height={14} fill="#26292d" />
      <rect x={10} y={-64} width={590} height={10} fill="#3a3e44" />
      <path d="M0 -64 L0 -40 L24 -40 L24 -64 Z" fill="#26292d" />
      <rect x={-4} y={-50} width={10} height={8} fill="#c23b2b" />
      <rect x={250} y={-58} width={150} height={8} fill="#4a4f56" />
      <rect x={430} y={-54} width={8} height={36} fill="#3a3e44" />
      <rect x={424} y={-20} width={20} height={6} fill="#26292d" />
      {/* tractor */}
      <rect x={586} y={-70} width={210} height={20} fill="#1f2226" />
      <path d="M640 -60 L640 -220 Q640 -258 676 -262 L760 -268 Q790 -268 796 -238 L806 -120 L808 -60 Z" fill="url(#cabShine)" />
      <path d="M738 -246 L782 -248 Q790 -248 791 -238 L797 -164 L742 -164 Z" fill="url(#glass)" />
      <path d="M664 -242 L728 -246 L730 -168 L662 -168 Z" fill="url(#glass)" />
      <rect x={652} y={-262} width={130} height={10} fill="#16181b" rx={4} />
      <rect x={734} y={-150} width={70} height={60} fill="#16181b" rx={3} />
      {[0, 1, 2, 3, 4].map(i => <rect key={i} x={740} y={-144 + i * 11} width={58} height={4} fill="#2e3237" />)}
      <rect x={794} y={-160} width={12} height={10} fill="#e9e3c9" rx={2} />
      <rect x={606} y={-200} width={10} height={140} fill="#9aa1a9" />
      <rect x={672} y={-110} width={36} height={8} fill="#2e3237" />
      <path d="M612 -50 A44 44 0 0 1 700 -50 Z" fill="#0c0d0f" />
      <path d="M716 -50 A44 44 0 0 1 806 -50 Z" fill="#0c0d0f" />
      {/* wheels: trailer x3, tractor x2 */}
      {[64, 132, 200].map((x, i) => <g key={x} transform={`translate(${x},-34)`}><Wheel r={34} wref={w(i)} /></g>)}
      <g transform="translate(656,-36)"><Wheel r={36} wref={w(3)} /></g>
      <g transform="translate(760,-36)"><Wheel r={36} wref={w(4)} /></g>
    </g>
  );
}

/* ---------- truck, top view (facing right; origin = centre) ---------- */
export function TruckTop() {
  const ribs: ReactNode[] = [];
  for (let x = -330; x < 200; x += 10) ribs.push(<rect key={x} x={x} y={-58} width={4} height={116} fill="#cfd3d9" />);
  return (
    <g>
      <rect x={-342} y={-64} width={556} height={128} fill="#000" opacity={0.25} transform="translate(8,10)" rx={6} />
      <rect x={-340} y={-60} width={548} height={120} fill="#eef0f3" />
      {ribs}
      <rect x={-340} y={-60} width={548} height={8} fill="#b3b9c1" />
      <rect x={-340} y={52} width={548} height={8} fill="#b3b9c1" />
      <rect x={-340} y={-60} width={10} height={120} fill="#b3b9c1" />
      <rect x={198} y={-60} width={10} height={120} fill="#b3b9c1" />
      {/* cab */}
      <rect x={216} y={-58} width={124} height={116} fill="#1b1d21" rx={12} />
      <rect x={226} y={-50} width={84} height={100} fill="#2a2e34" rx={8} />
      <rect x={312} y={-52} width={22} height={104} fill="#3a4a56" rx={6} />
      <rect x={240} y={-62} width={8} height={10} fill="#1b1d21" />
      <rect x={240} y={52} width={8} height={10} fill="#1b1d21" />
      <rect x={334} y={-46} width={6} height={14} fill="#f1e9c8" rx={2} />
      <rect x={334} y={32} width={6} height={14} fill="#f1e9c8" rx={2} />
    </g>
  );
}

/* ---------- container ship, top view (bow up; origin = centre; 220 × 1040) ---------- */
const BAY_COLOURS = [
  ['#2a9a4c', '#d9362c', '#1d2b8f', '#3a88de', '#e6642b'],
  ['#1d2b8f', '#e2559b', '#e9ecef', '#e6642b', '#e3a33a'],
  ['#e9ecef', '#1d2b8f', '#3a88de', '#d9362c', '#e2559b'],
  ['#3a88de', '#2a9a4c', '#1d2b8f', '#e9ecef', '#d9362c'],
  ['#e3a33a', '#d9362c', '#e9ecef', '#2a9a4c', '#1d2b8f'],
  ['#1d2b8f', '#3a88de', '#e6642b', '#e2559b', '#e9ecef'],
  ['#d9362c', '#e9ecef', '#1d2b8f', '#3a88de', '#2a9a4c'],
];

export function Ship() {
  const bays: ReactNode[] = [];
  BAY_COLOURS.forEach((row, b) => {
    const y = -330 + b * 118;
    bays.push(<rect key={'hb' + b} x={-92} y={y - 12} width={184} height={10} fill="#1a3b5c" />);
    row.forEach((c, i) => {
      const x = -88 + i * 35.5;
      bays.push(<rect key={`${b}-${i}`} x={x} y={y} width={32} height={102} fill={c} />);
      for (let k = 0; k < 9; k++) bays.push(<rect key={`${b}-${i}-${k}`} x={x + 2} y={y + 6 + k * 10.6} width={28} height={2.2} fill="#000" opacity={0.16} />);
    });
  });
  return (
    <g>
      <path d="M-110 470 L-110 -330 Q-110 -470 0 -520 Q110 -470 110 -330 L110 470 Q110 520 60 520 L-60 520 Q-110 520 -110 470 Z" fill="#000" opacity={0.3} transform="translate(10,14)" />
      <path d="M-110 470 L-110 -330 Q-110 -470 0 -520 Q110 -470 110 -330 L110 470 Q110 520 60 520 L-60 520 Q-110 520 -110 470 Z" fill="#245a86" />
      <path d="M-100 466 L-100 -326 Q-100 -456 0 -504 Q100 -456 100 -326 L100 466 Q100 508 56 508 L-56 508 Q-100 508 -100 466 Z" fill="#2c6ea3" stroke="#e8eef4" strokeWidth={3} />
      {/* forecastle */}
      <path d="M-70 -360 Q-60 -440 0 -470 Q60 -440 70 -360 Z" fill="#1d4f7a" />
      <circle cx={0} cy={-420} r={6} fill="#e8eef4" />
      {bays}
      {/* bridge (stern) */}
      <rect x={-96} y={500 - 120} width={192} height={64} fill="#eef1f4" />
      <rect x={-80} y={500 - 112} width={160} height={14} fill="#2b4c6b" />
      <rect x={-30} y={500 - 50} width={60} height={30} fill="#2a2f35" />
      <rect x={-22} y={500 - 46} width={44} height={8} fill="#c43b2b" />
    </g>
  );
}

/* ---------- airliner, top view (nose up; origin = centre; ~ 960 span) ---------- */
export function Plane() {
  return (
    <g>
      <defs>
        <filter id="plane-shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16" /></filter>
      </defs>
      <g opacity={0.22} transform="translate(60,90) scale(.96)" fill="#1b2b4a" filter="url(#plane-shadow)">
        <PlaneShape />
      </g>
      <PlaneShape detail />
    </g>
  );
}

function PlaneShape({ detail }: { detail?: boolean }) {
  const white = detail ? '#f4f5f7' : undefined;
  const shade = detail ? '#dcdfe4' : undefined;
  return (
    <g fill={white}>
      {/* wings */}
      <path d="M-34 -40 L-470 150 L-480 186 L-34 70 Z" fill={shade ?? undefined} />
      <path d="M34 -40 L470 150 L480 186 L34 70 Z" fill={shade ?? undefined} />
      <path d="M-34 -30 L-462 156 L-466 172 L-34 50 Z" />
      <path d="M34 -30 L462 156 L466 172 L34 50 Z" />
      {/* tailplane */}
      <path d="M-22 330 L-190 420 L-190 446 L-22 410 Z" fill={shade ?? undefined} />
      <path d="M22 330 L190 420 L190 446 L22 410 Z" fill={shade ?? undefined} />
      {/* fuselage */}
      <path d="M-38 -380 Q-38 -470 0 -500 Q38 -470 38 -380 L38 380 Q38 440 0 480 Q-38 440 -38 380 Z" />
      {detail && (
        <>
          <path d="M-16 -458 Q0 -476 16 -458 L14 -446 L-14 -446 Z" fill="#26313d" />
          <rect x={-3} y={-380} width={6} height={760} fill="#e4e7eb" />
          <path d="M-480 186 L-466 172 L-462 156 L-470 150 Z" fill="#c8202c" />
          <path d="M480 186 L466 172 L462 156 L470 150 Z" fill="#c8202c" />
          <path d="M-190 420 L-190 446 L-176 442 L-176 427 Z" fill="#c8202c" />
          <path d="M190 420 L190 446 L176 442 L176 427 Z" fill="#c8202c" />
          {/* engines */}
          {[-150, -290, 150, 290].map(x => (
            <g key={x} transform={`translate(${x}, ${Math.abs(x) * 0.43 + 4})`}>
              <rect x={-17} y={-58} width={34} height={92} rx={14} fill="#e9ecf0" />
              <rect x={-17} y={-58} width={34} height={14} rx={7} fill="#9aa1aa" />
              <rect x={-11} y={20} width={22} height={18} rx={6} fill="#b9bfc7" />
            </g>
          ))}
          <text x={0} y={-150} fontSize={18} fill="#0016cb" textAnchor="middle" fontFamily="'Saira', sans-serif" fontWeight={700} transform="rotate(-90 0 -150)" letterSpacing={3}>GARUDA</text>
        </>
      )}
    </g>
  );
}

/* ---------- pixel icons (dot-matrix, like the reference's service icons) ---------- */
const ICONS: Record<string, string[]> = {
  chat: [
    '...........',
    '.#########.',
    '.#.......#.',
    '.#.#.#.#.#.',
    '.#.......#.',
    '.#.#####.#.',
    '.#.......#.',
    '.###.#####.',
    '...#.#.....',
    '...##......',
    '...........',
  ],
  file: [
    '..######...',
    '..#....##..',
    '..#....#.#.',
    '..#....####',
    '..#.......#',
    '..#.##.##.#',
    '..#.......#',
    '..#.##.##.#',
    '..#.......#',
    '..#########',
    '...........',
  ],
  check: [
    '...#####...',
    '..#.....#..',
    '.#.......#.',
    '#.......#.#',
    '#......#..#',
    '#.#...#...#',
    '#..#.#....#',
    '.#..#....#.',
    '..#.....#..',
    '...#####...',
    '...........',
  ],
  truck: [
    '...........',
    '######.....',
    '#....#.###.',
    '#....#.#..#',
    '#....###..#',
    '#.........#',
    '###########',
    '.##....##..',
    '.##....##..',
    '...........',
    '...........',
  ],
  wrench: [
    '.......##..',
    '......#..#.',
    '.......#..#',
    '...#..#..#.',
    '....##..#..',
    '....#..#...',
    '...#..#....',
    '..#..#.....',
    '.#..#......',
    '#..#.......',
    '.##........',
  ],
  invoice: [
    '.#########.',
    '.#.......#.',
    '.#.####..#.',
    '.#.......#.',
    '.#.#####.#.',
    '.#.......#.',
    '.#.##.##.#.',
    '.#.......#.',
    '.#....##.#.',
    '.#.#.#.#.#.',
    '..#.#.#.#..',
  ],
  globe: [
    '...#####...',
    '..#..#..#..',
    '.#..#.#..#.',
    '#########.#',
    '#..#...#..#',
    '#..#...#..#',
    '#..#...#..#',
    '#.#########',
    '.#..#.#..#.',
    '..#..#..#..',
    '...#####...',
  ],
  shield: [
    '.....#.....',
    '...##.##...',
    '.##.....##.',
    '.#.......#.',
    '.#....#..#.',
    '.#...#...#.',
    '.#.#.#...#.',
    '..#.#...#..',
    '..#.....#..',
    '...##.##...',
    '.....#.....',
  ],
  clock: [
    '...#####...',
    '..#.....#..',
    '.#...#...#.',
    '#....#....#',
    '#....#....#',
    '#....###..#',
    '#.........#',
    '#.........#',
    '.#.......#.',
    '..#.....#..',
    '...#####...',
  ],
  pound: [
    '....####...',
    '...#....#..',
    '...#.......',
    '...#.......',
    '.######....',
    '...#.......',
    '...#.......',
    '..#........',
    '.#########.',
    '...........',
    '...........',
  ],
  arrows: [
    '...........',
    '.#....#....',
    '..#....#...',
    '...#....#..',
    '....#....#.',
    '.....#....#',
    '....#....#.',
    '...#....#..',
    '..#....#...',
    '.#....#....',
    '...........',
  ],
  contact: [
    '....###....',
    '...#...#...',
    '...#...#...',
    '...#...#...',
    '....###....',
    '...........',
    '..#######..',
    '.#.......#.',
    '.#.......#.',
    '.#########.',
    '...........',
  ],
};
export type IconName = keyof typeof ICONS;

export function PixelIcon({ name, size = 40, className }: { name: IconName; size?: number; className?: string }) {
  const rows = ICONS[name];
  const dots: ReactNode[] = [];
  rows.forEach((row, y) => Array.from(row).forEach((c, x) => {
    if (c === '#') dots.push(<rect key={`${x}-${y}`} x={x + 0.12} y={y + 0.12} width={0.76} height={0.76} rx={0.12} />);
  }));
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 11 11" aria-hidden="true" fill="currentColor">{dots}</svg>
  );
}
