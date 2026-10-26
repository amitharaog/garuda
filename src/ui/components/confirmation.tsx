/* Shipping-label card and the numbered "what happens next" steps. */
import { confirmation, countryCode, labelFields } from '../../domain';
import type { CheckResult } from '../../domain';

export function ShippingLabel({ r, reference }: { r: CheckResult; reference: string | null }) {
  const b = r.booking;
  return (
    <div className="label" data-testid="shipping-label">
      <div className="label-top">
        <div className="ref">
          <div className="eyebrow">{reference ? 'Booking confirmed' : 'Booking summary'}</div>
          <div className="code" data-testid="booking-ref">{reference || b.id}</div>
          <div className="muted" style={{ fontSize: 13 }}>{reference ? b.id : 'Not booked yet'} · {b.priority}</div>
        </div>
        <div className="cc" aria-label="Destination country">{countryCode(b.destCountry)}</div>
      </div>
      <div className="label-grid">
        {labelFields(r).map(f => (
          <div key={f.k}>
            <div className="k">{f.k}</div>
            <div className="v">{f.v.map((line, i) => <span key={i}>{i > 0 && <br />}{line}</span>)}</div>
          </div>
        ))}
      </div>
      <div className="bars" aria-hidden="true" />
    </div>
  );
}

export function NextSteps({ r }: { r: CheckResult }) {
  const c = confirmation(r);
  return (
    <div className="next">
      <p className="headline" style={{ margin: 0 }}>{c.headline}</p>
      <div className="eyebrow" style={{ marginTop: 10 }}>What happens next</div>
      <ol>{c.next.map((s, i) => <li key={i}>{s}</li>)}</ol>
    </div>
  );
}

export function Stepper({ steps }: { steps: Array<[string, boolean]> }) {
  let cur = steps.findIndex(s => !s[1]);
  if (cur < 0) cur = steps.length;
  return (
    <ol className="stepper" aria-label="Booking progress">
      {steps.map(([label, ok], i) => (
        <li key={label} className={ok ? 'done' : i === cur ? 'current' : ''} aria-current={i === cur ? 'step' : undefined}>
          <span className="dot">{ok ? '✓' : i + 1}</span>{label}
        </li>
      ))}
    </ol>
  );
}
