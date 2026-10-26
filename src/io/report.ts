/* Plain-text issues report (for "Copy report"). */
import { fmtDate } from '../domain/dates';
import { money } from '../domain/format';
import { statusLabel } from '../domain/rules';
import type { CheckResult } from '../domain/types';

/** Plain-text report for "Copy report". */
export function reportText(results: CheckResult[]): string {
  return results.map(r => {
    const b = r.booking, ch = r.rec.chosen;
    return [
      `${b.id} | ${b.seller} | ${r.status.toUpperCase()} (${statusLabel(r)})`,
      ...r.issues.filter(i => i.severity !== 'Info').map(i => `  [${i.rule} ${i.severity}${i.extra ? ', extra check' : ''}] ${i.what}\n     Fix: ${i.fix}`),
      ch ? `  Carrier: ${ch.key}, ${money(ch.cost)}, ETA ${fmtDate(r.eta)}. ${r.rec.reason}` : '',
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}
