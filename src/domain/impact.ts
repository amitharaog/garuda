/* What each caught issue would likely have cost if it had shipped: a rough, clearly-labelled estimate,
   used for the "cost and delay avoided" figures. Not carrier quotes. */
import type { CheckResult, Issue } from './types';

export interface RuleImpact {
  /** Typical extra cost in GBP (storage, re-delivery, fees, admin). */
  cost: number;
  /** Typical delay in days. */
  days: number;
  /** What usually happens. */
  what: string;
}

export const RULE_IMPACT: Readonly<Record<string, RuleImpact>> = {
  'R-01': { cost: 150, days: 3, what: 'Customs hold while the goods are classified, plus broker and storage fees' },
  'R-02': { cost: 250, days: 3, what: 'Customs query on the declared value; possible fine or re-declaration' },
  'R-03': { cost: 60, days: 1, what: 'Warehouse recount and stock discrepancy handling' },
  'R-04': { cost: 60, days: 1, what: 'Carton count mismatch at receiving, labels re-checked' },
  'R-05': { cost: 120, days: 1, what: 'Carrier refuses or re-palletises at collection' },
  'R-06': { cost: 500, days: 5, what: 'Load refused or returned; dangerous goods re-booked with a specialist' },
  'R-07': { cost: 80, days: 1, what: 'Carrier re-weighs and re-invoices; pallet limits re-checked' },
  'R-08': { cost: 90, days: 2, what: 'Truck turned away at the warehouse; failed delivery and re-delivery' },
  'R-09': { cost: 75, days: 2, what: 'Customs query on origin; preferential duty may be lost' },
  'R-10': { cost: 50, days: 1, what: 'Collection cannot be booked; schedule re-planned' },
};

export interface BookingImpact {
  /** Total estimated cost avoided (GBP). */
  cost: number;
  /** Longest single delay avoided (days); delays overlap, so they are not summed. */
  days: number;
  lines: Array<{ rule: string; title: string; cost: number; days: number; what: string }>;
}

const counted = (i: Issue) => (i.severity === 'Red' || i.severity === 'Amber') && !!RULE_IMPACT[i.rule];

export function bookingImpact(r: CheckResult): BookingImpact {
  const lines = r.issues.filter(counted).map(i => ({ rule: i.rule, title: i.title, ...RULE_IMPACT[i.rule] }));
  return {
    cost: lines.reduce((s, l) => s + l.cost, 0),
    days: lines.reduce((m, l) => Math.max(m, l.days), 0),
    lines,
  };
}

export interface FileImpact {
  cost: number;
  /** Sum of each booking's longest delay: booking-days of delay avoided. */
  days: number;
  issues: number;
  bookings: number;
}

export function fileImpact(results: CheckResult[]): FileImpact {
  return results.reduce<FileImpact>((acc, r) => {
    const b = bookingImpact(r);
    return { cost: acc.cost + b.cost, days: acc.days + b.days, issues: acc.issues + b.lines.length, bookings: acc.bookings + (b.lines.length ? 1 : 0) };
  }, { cost: 0, days: 0, issues: 0, bookings: 0 });
}
