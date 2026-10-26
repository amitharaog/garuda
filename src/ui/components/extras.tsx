/* Small shared pieces for the added features: cost-avoided note, cheaper options, bar lists. */
import { bookingImpact, cheaperAlternatives, money } from '../../domain';
import type { Action, Booking, CheckResult } from '../../domain';

export function ImpactNote({ r }: { r: CheckResult }) {
  const im = bookingImpact(r);
  if (!im.lines.length) return null;
  return (
    <div className="impact" data-testid="impact-note">
      <span className="impact-fig">~{money(im.cost)}</span>
      <span>
        and up to <b>{im.days} day{im.days === 1 ? '' : 's'}</b> of delay avoided by catching this before it ships
        <span className="muted"> (rough estimate: {im.lines.map(l => l.rule).join(', ')})</span>
      </span>
    </div>
  );
}

export function Alternatives({ booking, carrierOverride, onApply }: { booking: Booking; carrierOverride?: string | null; onApply: (actions: Action[], label: string) => void }) {
  const alts = cheaperAlternatives(booking, carrierOverride);
  if (!alts.length) return null;
  return (
    <div className="alts" data-testid="alternatives">
      <div className="eyebrow">Cheaper options</div>
      {alts.map(a => (
        <div className="alt" key={a.key + a.pallets}>
          <div><b className="alt-save">Save {money(a.saving)}</b> {a.text}</div>
          <button type="button" className="btn small" onClick={() => onApply(a.actions, `${a.pallets} pallets with ${a.carrier} (${money(a.cost)})`)}>Use this</button>
        </div>
      ))}
    </div>
  );
}

export function BarList({ rows, format = v => String(v), tone }: { rows: Array<{ label: string; value: number; hint?: string }>; format?: (v: number) => string; tone?: (label: string) => string }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="bars-list">
      {rows.map(r => (
        <div className="bar-row" key={r.label} title={r.hint}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track"><span className={`bar-fill ${tone ? tone(r.label) : ''}`} style={{ width: `${(r.value / max) * 100}%` }} /></span>
          <span className="bar-val">{format(r.value)}</span>
        </div>
      ))}
    </div>
  );
}
