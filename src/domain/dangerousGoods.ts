/* R-06: lithium batteries, aerosols and flammable liquids, detected from the item description. */

/** Phrases that cancel a match ("battery-free", "non-flammable"). */
const NEGATIONS =
  /(battery[- ]?free|no batter(y|ies)|without batter(y|ies)|batter(y|ies) not included|non[- ]?flammable|non[- ]?aerosol|empty spray|refillable empty|alcohol[- ]?free)/gi;

const DG = [
  {
    re: /lithium|li[- ]?ion|li[- ]?po(ly(mer)?)?\b|lipo\b|power ?bank|e[- ]?bike batter|18650|lifepo4/i,
    cat: 'lithium battery',
    why: 'Lithium batteries are a fire risk and are classed as dangerous goods (UN3480/UN3481).',
    un: 'UN3480 (batteries alone) / UN3481 (packed with or in equipment)',
    cls: 'Class 9: miscellaneous dangerous goods',
    needs: ['An ADR-certified road carrier', 'Battery state of charge and watt-hour rating per cell', 'UN38.3 test summary from the manufacturer', 'Class 9 lithium battery marks on each package', 'A dangerous goods note travelling with the load'],
  },
  {
    re: /aerosol|spray ?can|spray ?paint|hair ?spray|deodorant spray|body spray|dry shampoo|spray deodorant|pressuri[sz]ed can|compressed gas|butane|propane|gas canister/i,
    cat: 'aerosol / pressurised gas',
    why: 'Aerosols and pressurised cans can burst or ignite and are classed as dangerous goods (UN1950).',
    un: 'UN1950 Aerosols',
    cls: 'Class 2: gases (2.1 if flammable propellant)',
    needs: ['An ADR-certified road carrier', 'Limited Quantity marking if each can is 1 litre or less', 'The safety data sheet (SDS) for each product', 'Class 2 hazard labels when not shipped as Limited Quantity', 'A dangerous goods note travelling with the load'],
  },
  {
    re: /flammable|inflammable|petrol|gasoline|diesel|kerosene|paraffin|lighter fluid|lighter refill|white spirit|methylated|meths\b|turpentine|paint thinner|thinners?\b|acetone|nail polish|nail varnish|isopropyl|ethanol|methanol|solvent|perfume|eau de (parfum|toilette)|cologne|fragrance oil|hand sanitis|hand sanitiz|lamp oil|firelighter|fuel/i,
    cat: 'flammable liquid',
    why: 'This is normally classed as a flammable liquid (e.g. UN1263 / UN1266 / UN1993) and needs a dangerous-goods service.',
    un: 'Usually UN1266 (perfumery products), UN1263 (paint) or UN1993 (flammable liquid, n.o.s.)',
    cls: 'Class 3: flammable liquids (packing group II or III)',
    needs: ['An ADR-certified road carrier', 'The safety data sheet (SDS) with flash point and packing group', 'UN-approved packaging and Class 3 labels, or Limited Quantity marking for small inner packs', 'A dangerous goods note travelling with the load'],
  },
] as const;

export interface DGHit {
  term: string;
  cat: string;
  why: string;
  /** UN number(s) usually assigned. */
  un: string;
  /** ADR hazard class. */
  cls: string;
  /** What a dangerous-goods shipment of this kind needs. */
  needs: readonly string[];
}

export function detectDG(text: string): DGHit | null {
  const t = String(text || '');
  if (!t) return null;
  const cleaned = t.replace(NEGATIONS, ' ');
  for (const g of DG) {
    const m = cleaned.match(g.re);
    if (m) return { term: m[0], cat: g.cat, why: g.why, un: g.un, cls: g.cls, needs: g.needs };
  }
  return null;
}

/** Softer signals that deserve a human check but do not break R-06 by themselves. */
export function detectDGSoft(text: string): string | null {
  const t = String(text || '').replace(NEGATIONS, ' ');
  const m = t.match(/batter(y|ies)|rechargeable|cordless|wireless|bluetooth|\bspray\b|\boil\b|alcohol|vodka|whisky|gin\b|rum\b|ink\b|glue|adhesive/i);
  return m ? m[0] : null;
}
