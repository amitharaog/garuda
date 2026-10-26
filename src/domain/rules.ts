/* The rulebook (R-01..R-10) plus clearly labelled extra checks (X-xx). Pure: same booking in, same result out. */
import { ALLOWED, CITY_TO_COUNTRY, RULE } from './reference';
import { blank, fmtNum, kg, money, plural, round2 } from './format';
import { addDays, fmtDate, isWeekend, niceDate, nextWorkingDay, parseDate, today } from './dates';
import { hsDigits, suggestHS } from './hs';
import { detectDG, detectDGSoft } from './dangerousGoods';
import { recommendCarrier } from './carriers';
import { normalizeBooking } from './normalize';
import type { Booking, CheckOptions, CheckResult, Fix, Issue, Item, RawBooking, Severity } from './types';

type IssueInput = Omit<Issue, 'rule' | 'severity' | 'ruleText' | 'extra'> & { severity?: Severity; ruleText?: string };

const SEV_ORDER: Record<Severity, number> = { Red: 0, Amber: 1, Notice: 2, Info: 3 };

export const itemLabel = (it: Item, i: number): string => `${it.sku || 'Item ' + (i + 1)}${it.description ? ' (' + it.description + ')' : ''}`;

export function check(input: Booking | RawBooking, opts: CheckOptions = {}): CheckResult {
  const b = normalizeBooking(input as RawBooking);
  const items = b.items;
  const issues: Issue[] = [];
  const passed: Record<string, string> = {};
  const add = (rule: string, o: IssueInput) => {
    const r = RULE[rule];
    issues.push({
      ...o,
      rule,
      severity: r ? r.severity : (o.severity as Severity),
      ruleText: r ? r.text : (o.ruleText as string),
      extra: !r,
    });
  };
  // A rulebook rule can still raise a non-blocking notice (R-05 carrier switch).
  const addNotice = (rule: string, o: IssueInput) => issues.push({ ...o, rule, severity: 'Notice', ruleText: RULE[rule].text, extra: false });

  // X-01 required fields (the Field guide marks them all Required)
  const missing: string[] = [];
  const req: Array<[keyof Booking, string]> = [
    ['seller', 'Seller name'], ['originCity', 'Origin city'], ['originCountry', 'Origin country'], ['destCity', 'Destination city'],
    ['destCountry', 'Destination country'], ['destType', 'Destination type'], ['readyDate', 'Ready to ship date'], ['priority', 'Seller priority'],
    ['pallets', 'Pallets'], ['cartons', 'Cartons'], ['declaredValue', 'Total declared value'], ['currency', 'Currency'],
    ['grossWeight', 'Total gross weight (kg)'], ['appointment', 'Delivery appointment booked'],
  ];
  req.forEach(([k, l]) => { if (blank(b[k])) missing.push(l); });
  items.forEach((it, i) => {
    const itemReq: Array<[keyof Item, string]> = [['sku', 'SKU'], ['description', 'Description'], ['qty', 'Quantity'], ['unitPrice', 'Unit price'], ['upc', 'Units per carton'], ['cartons', 'Cartons'], ['unitWeight', 'Unit weight']];
    itemReq.forEach(([k, l]) => { if (blank(it[k])) missing.push(`${l} for ${itemLabel(it, i)}`); });
  });
  if (!items.length) missing.push('at least one item (Items sheet)');
  if (missing.length)
    add('X-01', {
      severity: 'Red', ruleText: 'All required fields in the Field guide must be filled in', title: 'Missing information',
      what: `These required details are missing: ${missing.join('; ')}.`, fix: 'Fill them in. Some rulebook checks cannot run until they are there.', missingList: missing,
    });

  // R-01 HS code of at least 6 digits
  let r01 = true;
  items.forEach((it, i) => {
    const d = hsDigits(it.hs);
    if (d.length >= 6) return;
    r01 = false;
    const sug = suggestHS(it.description);
    const fixes: Fix[] = [];
    const what = !d.length
      ? `${itemLabel(it, i)} has no HS code. Customs cannot classify it, so the shipment is likely to be held.`
      : `${itemLabel(it, i)} has HS code "${it.hs}": only ${d.length} digit${d.length === 1 ? '' : 's'}; at least 6 are needed.`;
    let fix = `Look up the code for "${it.description || it.sku}" on the UK Trade Tariff (trade-tariff.service.gov.uk) and enter at least the first 6 digits.`;
    if (d.length === 5) {
      fix += ` If the code starts with 0, Excel may have dropped the leading zero: "0${d}" would be 6 digits.`;
      fixes.push({ label: `Use 0${d} (restore leading zero)`, action: { type: 'setItem', index: i, field: 'hs', value: '0' + d } });
    }
    if (sug && sug.code !== '0' + d) {
      fix += ` A likely match is ${sug.code} (${sug.label}); please confirm it fits.`;
      fixes.push({ label: `Use suggested ${sug.code}`, action: { type: 'setItem', index: i, field: 'hs', value: sug.code } });
    } else if (sug) fix += ` That matches the likely code for this product, ${sug.code} (${sug.label}).`;
    add('R-01', { title: 'HS code missing or too short', what, fix, itemIndex: i, fixes });
  });
  if (items.length && r01) passed['R-01'] = `All ${plural(items.length, 'item')} have HS codes of 6+ digits.`;
  items.forEach((it, i) => {
    const d = hsDigits(it.hs);
    if (d.length > 10)
      add('X-02', { severity: 'Info', ruleText: 'HS / commodity codes are 6–10 digits', title: 'HS code looks too long', what: `${itemLabel(it, i)} has a ${d.length}-digit code (${it.hs}). UK/EU commodity codes are at most 10 digits.`, fix: 'Check for a typo.', itemIndex: i });
    else if (it.hs && /[^\d.\s]/.test(it.hs))
      add('X-02', { severity: 'Info', ruleText: 'HS codes contain digits only', title: 'HS code contains letters', what: `${itemLabel(it, i)} HS code "${it.hs}" contains non-digit characters.`, fix: 'Use digits only.', itemIndex: i });
  });

  // R-02 declared value = Σ qty × unit price, within 1%
  const valOK = items.length > 0 && items.every(it => it.qty !== null && it.unitPrice !== null);
  const sumVal = valOK ? round2(items.reduce((s, it) => s + (it.qty as number) * (it.unitPrice as number), 0)) : null;
  if (sumVal !== null && b.declaredValue !== null) {
    const diff = b.declaredValue - sumVal;
    const pct = sumVal ? Math.abs(diff) / sumVal : b.declaredValue === 0 ? 0 : Infinity;
    if (pct > 0.01 + 1e-12) {
      add('R-02', {
        title: 'Declared value does not match the items',
        what: `You declared ${money(b.declaredValue)}, but the items add up to ${money(sumVal)} (${items.map(it => `${fmtNum(it.qty)} × ${money(it.unitPrice)}`).join(' + ')}). That is ${diff > 0 ? 'over' : 'under'} by ${money(Math.abs(diff))} (${Number.isFinite(pct) ? (pct * 100).toFixed(1) + '%' : 'n/a'}); only 1% is allowed. Customs compares the declared value with the invoice lines${diff < 0 ? ', and under-declaring can mean fines or a customs hold' : ''}.`,
        fix: `Set the total declared value to ${money(sumVal)}, or, if the total is right, correct the unit prices or quantities that are wrong.`,
        fixes: [{ label: `Set declared value to ${money(sumVal)}`, action: { type: 'setBooking', field: 'declaredValue', value: sumVal } }],
        numbers: { declared: b.declaredValue, computed: sumVal },
      });
    } else passed['R-02'] = `Declared ${money(b.declaredValue)} vs items ${money(sumVal)}: ${(pct * 100).toFixed(2)}% difference (within 1%).`;
  }

  // R-03 units per carton × cartons = quantity
  let r03 = items.length > 0, r03ran = false;
  items.forEach((it, i) => {
    if (it.upc === null || it.cartons === null || it.qty === null) { r03 = false; return; }
    r03ran = true;
    const packed = it.upc * it.cartons;
    if (Math.abs(packed - it.qty) <= 1e-9) return;
    r03 = false;
    const fixes: Fix[] = [{ label: `Set quantity to ${fmtNum(packed)}`, action: { type: 'setItem', index: i, field: 'qty', value: packed } }];
    const c2 = it.qty / it.upc;
    if (it.upc && Number.isInteger(c2)) fixes.push({ label: `Set cartons to ${c2}`, action: { type: 'setItem', index: i, field: 'cartons', value: c2 } });
    const u2 = it.qty / it.cartons;
    if (it.cartons && Number.isInteger(u2)) fixes.push({ label: `Set units per carton to ${u2}`, action: { type: 'setItem', index: i, field: 'upc', value: u2 } });
    add('R-03', {
      title: 'Units do not match the cartons',
      what: `${itemLabel(it, i)}: ${fmtNum(it.upc)} units per carton × ${plural(it.cartons, 'carton')} = ${fmtNum(packed)} units, but the quantity says ${fmtNum(it.qty)} (${packed > it.qty ? fmtNum(packed - it.qty) + ' more' : fmtNum(it.qty - packed) + ' fewer'} packed than declared). The warehouse counts what arrives, so this shows up as missing or extra units.`,
      fix: `Recount and correct whichever number is wrong: ${fixes.map(f => f.label.toLowerCase()).join(', or ')}.`,
      itemIndex: i, fixes,
    });
  });
  if (r03 && r03ran) passed['R-03'] = 'Every item: units per carton × cartons = quantity.';

  // R-04 booking cartons = Σ item cartons
  const cartonsOK = items.length > 0 && items.every(it => it.cartons !== null);
  const sumCartons = cartonsOK ? items.reduce((s, it) => s + (it.cartons as number), 0) : null;
  if (sumCartons !== null && b.cartons !== null) {
    if (Math.abs(b.cartons - sumCartons) > 1e-9)
      add('R-04', {
        title: 'Carton total does not match the items',
        what: `The booking says ${plural(b.cartons, 'carton')}, but the items add up to ${plural(sumCartons, 'carton')} (${items.map(it => `${it.sku || '?'}: ${fmtNum(it.cartons)}`).join(', ')}). The warehouse will report ${b.cartons > sumCartons ? 'cartons missing' : 'unexpected extra cartons'}, and labels will not match.`,
        fix: `Set total cartons to ${fmtNum(sumCartons)}, or correct the item that has the wrong carton count.`,
        fixes: [{ label: `Set total cartons to ${fmtNum(sumCartons)}`, action: { type: 'setBooking', field: 'cartons', value: sumCartons } }],
      });
    else passed['R-04'] = `Booking cartons (${fmtNum(b.cartons)}) = sum of item cartons.`;
  }

  // Carrier choice (R-05 depends on it)
  const rec = recommendCarrier(b, opts.carrierOverride, opts.carriers);
  const ch = rec.chosen;

  // R-05 weight per pallet vs the chosen carrier's limit
  if (ch && b.pallets !== null && b.pallets > 0 && b.grossWeight !== null) {
    const wpp = b.grossWeight / b.pallets;
    if (wpp > ch.c.maxKg + 1e-9) {
      const need = Math.ceil(b.grossWeight / ch.c.maxKg - 1e-9);
      const bigger = rec.options.filter(o => o.eligible).sort((a, z) => a.c.price - z.c.price)[0];
      const offerSwitch = bigger && rec.mode === 'override';
      const fixes: Fix[] = [{ label: `Use ${need} pallets`, action: { type: 'setBooking', field: 'pallets', value: need } }];
      if (offerSwitch) fixes.push({ label: `Switch to ${bigger.key}`, action: { type: 'carrier', value: bigger.key } });
      // No carrier fits: also offer the fewest pallets that would let any carrier take the load.
      const fewest = rec.mode === 'none-eligible'
        ? rec.options.map(o => ({ o, n: Math.ceil((b.grossWeight as number) / o.c.maxKg - 1e-9) })).sort((x, z) => x.n - z.n || x.o.c.price - z.o.c.price)[0]
        : null;
      if (fewest && fewest.n < need) fixes.push({ label: `Use ${fewest.n} pallets (fits ${fewest.o.c.carrier})`, action: { type: 'setBooking', field: 'pallets', value: fewest.n } });
      add('R-05', {
        title: 'Pallets too heavy for the carrier',
        what: `${kg(b.grossWeight)} ÷ ${plural(b.pallets, 'pallet')} = ${kg(wpp)} per pallet, but ${ch.key} accepts at most ${ch.c.maxKg} kg per pallet. The carrier will refuse or re-palletise it at collection.`,
        fix: `Spread the goods over at least ${need} pallets (${kg(b.grossWeight / need)} each)${offerSwitch ? `, or switch to ${bigger.key} (max ${bigger.c.maxKg} kg)` : ''}. If the gross weight is overstated, correct it instead.`,
        fixes,
      });
    } else {
      passed['R-05'] = `${kg(wpp)} per pallet: within ${ch.key}'s ${ch.c.maxKg} kg limit.`;
      const sw = rec.notes.find(n => n.type === 'r05-switch');
      if (sw && sw.type === 'r05-switch')
        addNotice('R-05', {
          title: 'Too heavy for your preferred carrier, switched',
          what: sw.text,
          fix: sw.palletsNeeded ? `Nothing to fix for this booking. Optional: use ${sw.palletsNeeded} pallets to go with ${sw.preferred}.` : 'Nothing to fix.',
          fixes: sw.palletsNeeded
            ? [{ label: `Use ${sw.palletsNeeded} pallets (for ${sw.preferred.split(' · ')[0]})`, action: { type: 'setBooking', field: 'pallets', value: sw.palletsNeeded } }]
            : [],
        });
    }
  }

  // R-06 dangerous goods
  let r06 = true;
  items.forEach((it, i) => {
    const hit = detectDG(`${it.description} ${it.sku}`);
    if (hit) {
      r06 = false;
      add('R-06', {
        title: 'Dangerous goods not allowed',
        what: `${itemLabel(it, i)} looks like a ${hit.cat} (matched "${hit.term}"). ${hit.why} These carriers' road services do not accept it.`,
        fix: 'Take this item out of the shipment and send it separately with a dangerous-goods (ADR) specialist. If the description is wrong (e.g. it really is battery-free), correct the description.',
        itemIndex: i,
        fixes: [{ label: `Remove ${it.sku || 'item'} from shipment`, action: { type: 'removeItem', index: i } }],
      });
    } else {
      const soft = detectDGSoft(it.description);
      if (soft)
        add('X-03', {
          severity: 'Info', ruleText: 'Double-check items that might contain restricted contents', title: 'Please confirm contents',
          what: `${itemLabel(it, i)} mentions "${soft}". It passes R-06 as described, but check it contains no lithium battery, aerosol or flammable liquid.`,
          fix: 'If it does, remove it from this shipment; if not, no action needed.', itemIndex: i,
        });
    }
  });
  if (items.length && r06) passed['R-06'] = 'No lithium batteries, aerosols or flammable liquids found in item descriptions.';

  // R-07 gross weight ≥ Σ unit weight × quantity
  const wOK = items.length > 0 && items.every(it => it.unitWeight !== null && it.qty !== null);
  const net = wOK ? round2(items.reduce((s, it) => s + (it.unitWeight as number) * (it.qty as number), 0)) : null;
  if (net !== null && b.grossWeight !== null) {
    if (b.grossWeight + 1e-9 < net) {
      const est = Math.ceil(net + (b.pallets || 1) * 25);
      add('R-07', {
        title: 'Gross weight is lower than the goods alone',
        what: `The goods alone weigh ${kg(net)} (${items.map(it => `${fmtNum(it.qty)} × ${kg(it.unitWeight)}`).join(' + ')}), but the total gross weight is only ${kg(b.grossWeight)}. Gross weight must also include cartons and pallets, so it is understated. Carriers re-weigh and charge or delay for this, and it affects pallet limits.`,
        fix: `Re-weigh the shipment. It must be at least ${kg(net)}; with packaging and pallets (~25 kg each) expect about ${kg(est)}.`,
        fixes: [{ label: `Set gross weight to ~${fmtNum(est)} kg (estimate)`, action: { type: 'setBooking', field: 'grossWeight', value: est } }],
      });
    } else passed['R-07'] = `Gross ${kg(b.grossWeight)} ≥ goods ${kg(net)} (packaging ${kg(b.grossWeight - net)}).`;
  }

  // R-08 warehouse deliveries need an appointment
  const rd = parseDate(b.readyDate);
  const eta = rd && ch ? addDays(rd, ch.c.transit) : null;
  if (b.destType === 'Warehouse') {
    if (b.appointment !== 'Yes')
      add('R-08', {
        title: 'No delivery appointment at the warehouse',
        what: `This goes to a warehouse in ${b.destCity || b.destCountry}, but no delivery slot is booked. Warehouses usually turn away trucks without an appointment, so the goods sit at the depot.`,
        fix: `Book a delivery slot with the receiving warehouse${eta && ch ? ` for ${niceDate(eta)} or later (the estimated arrival with ${ch.c.carrier})` : ''}, then mark the appointment as booked.`,
        fixes: [{ label: "I've booked the slot", action: { type: 'setBooking', field: 'appointment', value: 'Yes' } }],
      });
    else passed['R-08'] = 'Warehouse delivery appointment is booked.';
  } else if (b.destType) passed['R-08'] = 'Not a warehouse delivery, so no appointment needed.';

  // R-09 country of origin
  let r09 = true;
  items.forEach((it, i) => {
    if (blank(it.origin)) {
      r09 = false;
      add('R-09', {
        title: 'Country of origin missing',
        what: `${itemLabel(it, i)} has no country of origin. Customs uses it to set duty and check trade-agreement eligibility.`,
        fix: `Add where the product was made (not where it ships from), e.g. ${ALLOWED.itemOrigin.join(', ')}.`,
        itemIndex: i, fixes: [],
      });
    } else if (!(ALLOWED.itemOrigin as readonly string[]).includes(it.origin))
      add('X-04', { severity: 'Info', ruleText: 'Country of origin should be a recognised country', title: 'Unrecognised country of origin', what: `${itemLabel(it, i)} origin "${it.origin}" is not one of the expected countries.`, fix: 'Check the spelling.', itemIndex: i });
  });
  if (items.length && r09) passed['R-09'] = 'Every item has a country of origin.';

  // R-10 ready date not in the past (+ X-05 unreadable date, X-06 weekend)
  if (!blank(b.readyDate) && !rd)
    add('X-05', { severity: 'Red', ruleText: 'Ready to ship date must be a valid DD-MM-YYYY date', title: 'Ready date not understood', what: `"${b.readyDate}" is not a valid date in DD-MM-YYYY format.`, fix: 'Enter the date as DD-MM-YYYY, e.g. 05-11-2026.' });
  if (rd) {
    const t = today();
    if (rd < t) {
      const nw = nextWorkingDay(t);
      add('R-10', {
        title: 'Ready date is in the past',
        what: `The ready to ship date ${fmtDate(rd)} is before today (${fmtDate(t)}). A carrier cannot collect in the past, so the booking would be rejected or the schedule is wrong.`,
        fix: `Choose the real date the goods will be packed, e.g. ${fmtDate(nw)} (next working day).`,
        fixes: [{ label: `Set to ${fmtDate(nw)}`, action: { type: 'setBooking', field: 'readyDate', value: fmtDate(nw) } }],
      });
    } else {
      passed['R-10'] = `Ready on ${niceDate(rd)}: not in the past.`;
      if (isWeekend(rd))
        add('X-06', { severity: 'Info', ruleText: 'Collections normally happen on working days', title: 'Ready date is a weekend', what: `${niceDate(rd)} is a ${rd.getDay() === 0 ? 'Sunday' : 'Saturday'}. Road carriers usually collect Monday to Friday.`, fix: `Expect collection on ${niceDate(nextWorkingDay(rd))}.` });
    }
  }

  // Extra checks on route and allowed values
  const cityCountry = CITY_TO_COUNTRY[b.destCity];
  if (b.destCity && b.destCountry && cityCountry && cityCountry !== b.destCountry)
    add('X-07', {
      severity: 'Amber', ruleText: 'Destination city must be in the destination country', title: 'City and country do not match',
      what: `${b.destCity} is in ${cityCountry}, not ${b.destCountry}. The carrier route and price depend on the country, so one of them is wrong.`,
      fix: 'Correct the city or the country.',
      fixes: [{ label: `Set country to ${cityCountry}`, action: { type: 'setBooking', field: 'destCountry', value: cityCountry } }],
    });
  if (b.currency && b.currency !== 'GBP')
    add('X-08', { severity: 'Amber', ruleText: 'Currency must be GBP', title: 'Currency is not GBP', what: `Currency is "${b.currency}"; all prices and carrier rates are in GBP.`, fix: 'Convert values to GBP.', fixes: [{ label: 'Set currency to GBP', action: { type: 'setBooking', field: 'currency', value: 'GBP' } }] });
  if (b.originCountry && b.originCountry !== 'United Kingdom')
    add('X-09', { severity: 'Amber', ruleText: 'Shipments originate in the United Kingdom', title: 'Origin outside the UK', what: `Origin country is "${b.originCountry}"; carrier services only run from the United Kingdom.`, fix: 'Correct the origin.' });
  const skus: Record<string, number> = {};
  items.forEach(it => { if (it.sku) skus[it.sku] = (skus[it.sku] || 0) + 1; });
  Object.entries(skus).filter(([, n]) => n > 1).forEach(([s, n]) =>
    add('X-10', { severity: 'Info', ruleText: 'Each SKU should appear once per booking', title: 'Duplicate SKU', what: `SKU ${s} appears ${n} times in this booking.`, fix: 'Merge the lines if they are the same product.' }));
  items.forEach((it, i) => (['qty', 'unitPrice', 'upc', 'cartons', 'unitWeight'] as const).forEach(k => {
    const v = it[k];
    if (v !== null && v < 0) add('X-11', { severity: 'Red', ruleText: 'Quantities and prices cannot be negative', title: 'Negative number', what: `${itemLabel(it, i)} has a negative ${k}.`, fix: 'Correct it.', itemIndex: i });
  }));
  if (b.pallets !== null && (b.pallets <= 0 || !Number.isInteger(b.pallets)))
    add('X-12', { severity: 'Red', ruleText: 'Pallets must be a whole number above zero', title: 'Pallet count invalid', what: `Pallets is ${b.pallets}.`, fix: 'Enter a whole number of pallets (1 or more).' });

  issues.sort((a, z) => SEV_ORDER[a.severity] - SEV_ORDER[z.severity] || a.rule.localeCompare(z.rule));
  const red = issues.filter(i => i.severity === 'Red').length;
  const amber = issues.filter(i => i.severity === 'Amber').length;
  const status = red ? 'Red' : amber ? 'Amber' : 'Green';
  const totals = {
    sumVal, sumCartons, net,
    units: items.reduce((s, it) => s + (it.qty || 0), 0),
    wpp: b.pallets !== null && b.pallets > 0 && b.grossWeight !== null ? b.grossWeight / b.pallets : null,
  };
  return { booking: b, issues, passed, red, amber, status, rec, eta, totals };
}

export function statusLabel(r: Pick<CheckResult, 'status'>): string {
  return r.status === 'Red' ? 'On hold: must fix before it ships' : r.status === 'Amber' ? 'Can ship, but has risks to check' : 'Ready to book';
}
