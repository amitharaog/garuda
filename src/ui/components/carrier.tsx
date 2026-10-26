/* Carrier recommendation: the pick with its reason, comparison cards and the pallet-weight gauge. */
import { fmtNum, money } from '../../domain';
import type { CheckResult } from '../../domain';

export type OnCarrier = (key: string | null) => void;

export function PalletGauge({ r }: { r: CheckResult }) {
  const wpp = r.totals.wpp, opts = r.rec.options, ch = r.rec.chosen;
  if (wpp === null || !opts.length) return null;
  const max = Math.max(800, Math.ceil(wpp / 100) * 100 + 100);
  const W = 520, x = (v: number) => 10 + (v / max) * (W - 20);
  const over = !!ch && wpp > ch.c.maxKg;
  return (
    <div className="gauge">
      <div className="eyebrow">Weight per pallet vs carrier limits (kg)</div>
      <svg viewBox={`0 0 ${W} 60`} role="img" aria-label={`${fmtNum(wpp)} kg per pallet`}>
        <rect className="bar-bg" x={10} y={20} width={W - 20} height={14} rx={3} />
        <rect x={10} y={20} width={Math.max(2, x(Math.min(wpp, max)) - 10)} height={14} rx={3} fill={over ? 'var(--red)' : 'var(--accent)'} />
        {opts.map(o => (
          <g key={o.key}>
            <line className="lim" x1={x(o.c.maxKg)} x2={x(o.c.maxKg)} y1={14} y2={40} />
            <text x={x(o.c.maxKg)} y={54} textAnchor="middle">{o.c.carrier.slice(-1)} {o.c.maxKg}</text>
          </g>
        ))}
        <text x={Math.min(x(wpp), W - 40)} y={12} textAnchor="middle" style={{ fill: 'var(--ink)', fontWeight: 600 }}>{fmtNum(wpp, 1)} kg</text>
      </svg>
    </div>
  );
}

export function CarrierPick({ r }: { r: CheckResult }) {
  const rec = r.rec, ch = rec.chosen;
  if (!ch) return <p className="muted">{rec.reason}</p>;
  return (
    <>
      <div className="carrier-pick">
        <div>
          <div className="eyebrow">{rec.mode === 'override' ? 'Your chosen carrier' : `Recommended for “${rec.priority}”`}</div>
          <div className="name">{ch.c.carrier} · {ch.c.service}</div>
        </div>
        <div className="cost" data-testid="carrier-cost">{money(ch.cost)}</div>
      </div>
      <p className="reason">{rec.reason}</p>
      {rec.notes.map((n, i) => <div className="carrier-note" key={i}>{n.text}</div>)}
    </>
  );
}

export function CarrierCards({ r, onCarrier }: { r: CheckResult; onCarrier: OnCarrier }) {
  const rec = r.rec, ch = rec.chosen;
  if (!ch) return <CarrierPick r={r} />;
  const cards = rec.options.slice().sort((a, z) => a.c.price - z.c.price);
  return (
    <>
      <CarrierPick r={r} />
      {rec.mode === 'override' && (
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" className="btn small" onClick={() => onCarrier(null)}>Back to the recommended carrier</button>
        </div>
      )}
      <div className="ccards">
        {cards.map(o => (
          <div key={o.key} className={`ccard ${o === ch ? 'chosen' : ''} ${o.eligible === false ? 'nofit' : ''}`} data-carrier={o.c.carrier}>
            {o === ch ? <span className="badge">{rec.mode === 'override' ? 'Chosen' : 'Recommended'}</span> : <span className="badge ghost">Option</span>}
            <div className="ccard-top"><b>{o.c.carrier}</b></div>
            <div className="muted ccard-svc">{o.c.service}</div>
            <div className="ccard-cost">{o.cost === null ? <>{money(o.c.price)}<small>/pallet</small></> : money(o.cost)}</div>
            <dl>
              <dt>Per pallet</dt><dd>{money(o.c.price)}</dd>
              <dt>Transit</dt><dd>{o.c.transit} days</dd>
              <dt>On time</dt><dd>{o.c.ontime}%</dd>
              <dt>Max load</dt>
              <dd>{o.c.maxKg} kg {o.eligible === null ? null : o.eligible ? <span className="yes">✓ fits</span> : <span className="no">✕ too heavy</span>}</dd>
            </dl>
            {o !== ch && <button type="button" className="btn small" onClick={() => onCarrier(o.key)}>Use {o.c.carrier}</button>}
          </div>
        ))}
      </div>
      <PalletGauge r={r} />
    </>
  );
}
