/* Insights: what the checked file says about mistakes, sellers, freight, delivery risk, carrier prices and consolidation. */
import { useMemo, useState } from 'react';
import {
  carrierWhatIf, consolidationOpportunities, fileImpact, freightBy, issuesByRule, money, onTimeRisk, sellerScorecards,
} from '../domain';
import type { Booking, CheckResult } from '../domain';
import { BarList } from './components/extras';

export function InsightsView({ results, bookings, overrides, name, onOpen }: {
  results: CheckResult[]; bookings: Booking[]; overrides: Record<string, string>; name: string; onOpen: (id: string) => void;
}) {
  const [carrier, setCarrier] = useState('Carrier B');
  const [pct, setPct] = useState(10);
  const impact = useMemo(() => fileImpact(results), [results]);
  const byRule = useMemo(() => issuesByRule(results), [results]);
  const sellers = useMemo(() => sellerScorecards(results), [results]);
  const risks = useMemo(() => results.map(r => ({ r, risk: onTimeRisk(r) })).sort((a, z) => z.risk.score - a.risk.score), [results]);
  const consolidations = useMemo(() => consolidationOpportunities(results), [results]);
  const whatIf = useMemo(() => carrierWhatIf(bookings, overrides, carrier, pct), [bookings, overrides, carrier, pct]);
  const freight = results.reduce((s, r) => s + (r.rec.chosen?.cost || 0), 0);

  if (!results.length)
    return <div className="panel empty">No bookings to analyse yet. Load a file or the sample on the <b>Check a file</b> tab.</div>;

  return (
    <div className="insights" data-testid="insights">
      <p className="muted" style={{ margin: '0 0 14px' }}>Based on the {results.length} bookings in <b>{name}</b>. Figures marked “est.” are rough estimates, not quotes.</p>
      <div className="kpis">
        <div className="panel kpi"><span className="eyebrow">Bookings</span><b>{results.length}</b><span className="muted">{results.filter(r => r.status === 'Green').length} ready, {results.filter(r => r.status === 'Red').length} on hold</span></div>
        <div className="panel kpi"><span className="eyebrow">Issues caught</span><b>{impact.issues}</b><span className="muted">across {impact.bookings} bookings</span></div>
        <div className="panel kpi accent"><span className="eyebrow">Cost avoided (est.)</span><b>{money(impact.cost)}</b><span className="muted">{impact.days} booking-days of delay</span></div>
        <div className="panel kpi"><span className="eyebrow">Freight</span><b>{money(freight)}</b><span className="muted">at recommended carriers</span></div>
      </div>

      <div className="insights-grid">
        <section className="panel prose">
          <h2>Mistakes by rule</h2>
          <p className="muted">How many bookings break each rule.</p>
          <BarList rows={byRule.map(r => ({ label: `${r.rule}`, value: r.count, hint: r.text }))} tone={l => (byRule.find(r => r.rule === l)?.severity === 'Red' ? 'red' : 'amber')} />
        </section>

        <section className="panel prose">
          <h2>Freight by carrier</h2>
          <BarList rows={freightBy(results, 'carrier').map(s => ({ label: s.label.replace(' · ', ' '), value: s.value, hint: `${s.count} bookings` }))} format={money} />
          <h2 style={{ marginTop: 16 }}>Freight by route</h2>
          <BarList rows={freightBy(results, 'route').map(s => ({ label: s.label, value: s.value, hint: `${s.count} bookings` }))} format={money} />
        </section>

        <section className="panel prose span-2">
          <h2>Seller scorecards</h2>
          <div className="tbl-wrap">
            <table data-testid="scorecards">
              <thead><tr><th>Seller</th><th className="n">Bookings</th><th>Status</th><th className="n">Clean rate</th><th>Most common problems</th><th className="n">Freight</th><th className="n">Cost avoided (est.)</th></tr></thead>
              <tbody>
                {sellers.map(s => (
                  <tr key={s.seller}>
                    <td><b>{s.seller}</b></td>
                    <td className="n">{s.bookings}</td>
                    <td>
                      {s.red > 0 && <span className="pill Red">{s.red}</span>} {s.amber > 0 && <span className="pill Amber">{s.amber}</span>} {s.green > 0 && <span className="pill Green">{s.green}</span>}
                    </td>
                    <td className="n">{s.cleanRate}%</td>
                    <td>{s.topRules.length ? <div className="rulechips">{s.topRules.map(r => <span key={r} className="rc Red">{r}</span>)}</div> : <span className="muted">none</span>}</td>
                    <td className="n">{money(s.freight)}</td>
                    <td className="n">{money(s.costAvoided)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel prose">
          <h2>On-time risk</h2>
          <p className="muted">Carrier on-time rate plus open issues. A heuristic, not a forecast.</p>
          <div className="risks">
            {risks.slice(0, 6).map(({ r, risk }) => (
              <button type="button" className="risk" key={risk.id} onClick={() => onOpen(risk.id)} title={risk.reasons.join('; ')}>
                <span className={`risk-score ${risk.level}`}>{risk.score}</span>
                <span><b className="mono">{risk.id}</b> · {r.booking.seller}<br /><span className="muted">{risk.reasons.join(' · ')}</span></span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel prose">
          <h2>Carrier price what-if</h2>
          <div className="row" style={{ marginBottom: 8 }}>
            <label htmlFor="wi-carrier" className="muted">If</label>
            <select id="wi-carrier" value={carrier} onChange={e => setCarrier(e.target.value)} className="inline-select">
              {['Carrier A', 'Carrier B', 'Carrier C'].map(c => <option key={c}>{c}</option>)}
            </select>
            <label htmlFor="wi-pct" className="muted">changed prices by</label>
            <b className="num" style={{ minWidth: 44 }}>{pct > 0 ? '+' : ''}{pct}%</b>
          </div>
          <input id="wi-pct" type="range" min={-30} max={30} step={5} value={pct} onChange={e => setPct(+e.target.value)} className="slider" aria-label="Price change percent" />
          <p data-testid="whatif-result">
            Freight would go from <b>{money(whatIf.before)}</b> to <b>{money(whatIf.after)}</b> ({whatIf.after >= whatIf.before ? '+' : ''}{money(whatIf.after - whatIf.before)}).{' '}
            {whatIf.switched.length ? `${whatIf.switched.length} booking${whatIf.switched.length > 1 ? 's' : ''} would switch carrier:` : 'No booking would switch carrier.'}
          </p>
          {whatIf.switched.length > 0 && (
            <ul className="small-list">{whatIf.switched.map(s => <li key={s.id}><b className="mono">{s.id}</b>: {s.from} → {s.to} ({money(s.costBefore)} → {money(s.costAfter)})</li>)}</ul>
          )}
        </section>

        <section className="panel prose span-2">
          <h2>Consolidation opportunities</h2>
          {consolidations.length ? (
            <ul className="small-list">{consolidations.map(c => <li key={c.ids.join()}>{c.text}</li>)}</ul>
          ) : (
            <p className="muted" data-testid="no-consolidation">No two bookings from the same seller go to the same place within 3 days of each other, so there is nothing to combine in this file.</p>
          )}
        </section>
      </div>
    </div>
  );
}
