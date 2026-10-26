/* Carrier evaluation and recommendation (priority logic + R-05 fallback). */
import { CARRIERS, PRIORITIES } from './reference';
import { kg, money, plural } from './format';
import type { Booking, Carrier, CarrierNote, CarrierOption, Priority, Recommendation, RecommendMode } from './types';

export const carrierKey = (c: Carrier): string => `${c.carrier} · ${c.service}`;

export function routeCarriers(destCountry: string, carriers: readonly Carrier[] = CARRIERS): Carrier[] {
  return carriers.filter(c => c.origin === 'United Kingdom' && c.dest === destCountry);
}

/** Every carrier on the route with its cost, R-05 eligibility and 0–1 scores (1 = best on the route). */
export function evaluateCarriers(b: Pick<Booking, 'destCountry' | 'pallets' | 'grossWeight'>, carriers?: readonly Carrier[]): CarrierOption[] {
  const list = routeCarriers(b.destCountry, carriers);
  const pallets = b.pallets, gw = b.grossWeight;
  const wpp = pallets !== null && pallets > 0 && gw !== null ? gw / pallets : null;
  // Min-max across the route; a flat metric scores 1 for everyone.
  const range = (f: (c: Carrier) => number, lowerBetter: boolean) => {
    const vals = list.map(f);
    const mn = Math.min(...vals), mx = Math.max(...vals);
    return (c: Carrier) => (mx === mn ? 1 : lowerBetter ? (mx - f(c)) / (mx - mn) : (f(c) - mn) / (mx - mn));
  };
  const sCost = range(c => c.price, true), sSpeed = range(c => c.transit, true), sRel = range(c => c.ontime, false);
  return list.map(c => {
    const scores = { cost: sCost(c), speed: sSpeed(c), reliability: sRel(c) };
    return {
      c,
      key: carrierKey(c),
      cost: pallets !== null && pallets > 0 ? c.price * pallets : null,
      wpp,
      eligible: wpp === null ? null : wpp <= c.maxKg + 1e-9,
      palletsNeeded: gw !== null && gw > 0 ? Math.max(pallets || 0, Math.ceil(gw / c.maxKg - 1e-9)) : null,
      scores,
      balancedMin: Math.min(scores.cost, scores.speed, scores.reliability),
      balancedAvg: (scores.cost + scores.speed + scores.reliability) / 3,
    };
  });
}

export const SORTERS: Record<Priority, (a: CarrierOption, b: CarrierOption) => number> = {
  Cheapest: (a, b) => a.c.price - b.c.price || a.c.transit - b.c.transit,
  Fastest: (a, b) => a.c.transit - b.c.transit || b.c.ontime - a.c.ontime || a.c.price - b.c.price,
  'Most reliable': (a, b) => b.c.ontime - a.c.ontime || a.c.price - b.c.price,
  // Highest worst-case score, then highest average, then lowest price.
  Balanced: (a, b) => b.balancedMin - a.balancedMin || b.balancedAvg - a.balancedAvg || a.c.price - b.c.price,
};

const asPriority = (p: string): Priority | null => (PRIORITIES as readonly string[]).includes(p) ? (p as Priority) : null;

export function recommendCarrier(b: Booking, override?: string | null, carriers?: readonly Carrier[]): Recommendation {
  const opts = evaluateCarriers(b, carriers);
  const priority = asPriority(b.priority) || 'Balanced';
  if (!opts.length)
    return {
      chosen: null, preferred: null, options: [], ranked: [], priority, notes: [], mode: null,
      reason: 'No carrier runs this route yet. The destination country must be Germany, France or the Netherlands.',
    };
  const ranked = opts.slice().sort(SORTERS[priority]);
  ranked.forEach((o, i) => (o.rank = i + 1));
  const preferred = ranked[0];
  const notes: CarrierNote[] = [];
  let chosen: CarrierOption, mode: RecommendMode;
  if (override) {
    chosen = opts.find(o => o.key === override) || preferred;
    mode = 'override';
  } else {
    const eligible = ranked.filter(o => o.eligible !== false);
    chosen = eligible[0] || preferred;
    mode = eligible.length ? 'auto' : 'none-eligible';
  }
  const c = chosen.c;
  const others = opts.filter(o => o !== chosen);
  const cmp = (o: CarrierOption) => `${o.c.carrier} ${money(o.cost ?? o.c.price)}${o.cost === null ? '/pallet' : ''}, ${o.c.transit} days, ${o.c.ontime}%`;
  const pal = b.pallets !== null && b.pallets > 0 ? `${money(chosen.cost)} for ${plural(b.pallets, 'pallet')} (${money(c.price)}/pallet)` : `${money(c.price)} per pallet`;
  const sw = mode === 'auto' && chosen !== preferred ? ' that can take your pallets' : '';
  let why: string;
  switch (priority) {
    case 'Cheapest': why = `You asked for the cheapest option. ${chosen.key} is the cheapest carrier${sw}: ${pal}`; break;
    case 'Fastest': why = `You asked for the fastest option. ${chosen.key} is the fastest carrier${sw}: ${c.transit} days door to door`; break;
    case 'Most reliable': why = `You asked for the most reliable option. ${chosen.key} is the most reliable carrier${sw}: on the promised day ${c.ontime}% of the time`; break;
    default:
      why = `You have no strong preference, so we picked the carrier with no weak spot: the best worst-case score across cost, speed and on-time rate. ${chosen.key} scores ${Math.round(chosen.scores.cost * 100)}/100 on cost, ${Math.round(chosen.scores.speed * 100)}/100 on speed and ${Math.round(chosen.scores.reliability * 100)}/100 on reliability`;
  }
  why += `. Compared with ${others.map(cmp).join('; ')}.`;
  why += priority !== 'Fastest' ? ` Transit is ${c.transit} days` : ` Cost is ${pal}`;
  why += priority !== 'Most reliable' ? `, with a ${c.ontime}% on-time record.` : '.';

  if (mode === 'auto' && chosen !== preferred && preferred.eligible === false) {
    const p = preferred, need = p.palletsNeeded, altCost = need ? need * p.c.price : null;
    const gw = b.grossWeight ?? 0;
    notes.push({
      type: 'r05-switch', preferred: p.key, palletsNeeded: need, altCost,
      text: `${p.key} would normally win on "${priority}", but your pallets weigh ${kg(p.wpp)} each, over its ${p.c.maxKg} kg limit (rule R-05). So we recommend ${chosen.key} instead.` +
        (need && altCost !== null && chosen.cost !== null
          ? ` If you would rather use ${p.c.carrier}, spread the load over ${need} pallets (${kg(gw / need)} each): that costs ${money(altCost)} vs ${money(chosen.cost)}, ${altCost < chosen.cost ? 'cheaper' : altCost > chosen.cost ? 'more expensive' : 'the same'}.`
          : ''),
    });
  }
  if (mode === 'none-eligible')
    notes.push({ type: 'r05-none', text: `At ${kg(chosen.wpp)} per pallet, no carrier on this route can take your pallets (limits: ${opts.map(o => `${o.c.carrier} ${o.c.maxKg} kg`).join(', ')}). You need more pallets or a lower gross weight; see R-05.` });
  if (mode === 'override' && chosen !== preferred)
    notes.push({ type: 'override', text: `You chose ${chosen.key} yourself. Our pick for "${priority}" would be ${preferred.key}.` });
  if (!asPriority(b.priority)) notes.push({ type: 'priority', text: 'No seller priority was given, so we used "Balanced".' });
  return { chosen, preferred, options: opts, ranked, priority, reason: why, notes, mode };
}
