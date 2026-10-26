/* Rules tab: the rulebook, extra checks, how some rules are read, and how Pre-Flight works. No rate card here. */
import { PROTECTS, RULES } from '../domain';

const EXTRAS: Array<[string, string, string]> = [
  ['X-01', 'Required fields from the Field guide are filled in (pallets, gross weight, etc.)', 'Red'],
  ['X-05', 'Ready date is a real DD-MM-YYYY date', 'Red'],
  ['X-07', 'Destination city is in the destination country', 'Amber'],
  ['X-08', 'Currency is GBP', 'Amber'],
  ['X-02 / X-03 / X-06 / X-10', 'Info notes: HS code over 10 digits, items that might hide restricted contents, weekend ready dates, duplicate SKU', 'Info'],
];

export function RulesView() {
  return (
    <div className="rules-grid">
      <div className="panel prose">
        <h2>The rulebook</h2>
        <p>Every booking, typed in chat or uploaded, is checked against exactly these 10 rules. <b>Red</b> = the shipment must not go until fixed. <b>Amber</b> = risky, fix or check.</p>
        <div className="tbl-wrap">
          <table data-testid="rulebook">
            <thead><tr><th>Rule</th><th>Check</th><th>Severity</th><th>Protects</th></tr></thead>
            <tbody>
              {RULES.map(r => (
                <tr key={r.id}><td className="mono">{r.id}</td><td>{r.text}</td><td><span className={`pill ${r.severity}`}>{r.severity}</span></td><td className="muted">{PROTECTS[r.id]}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <h2 style={{ marginTop: 18 }}>Extra checks</h2>
        <p>Shown separately and labelled “extra check”, so they never get mixed up with the rulebook.</p>
        <div className="tbl-wrap">
          <table><tbody>{EXTRAS.map(x => <tr key={x[0]}><td className="mono">{x[0]}</td><td>{x[1]}</td><td>{x[2]}</td></tr>)}</tbody></table>
        </div>
        <h2 style={{ marginTop: 18 }}>How some rules are read</h2>
        <ul>
          <li><b>R-01</b> counts digits only (so “6912.00” counts as 6). A 5-digit code gets a hint that Excel may have dropped a leading 0.</li>
          <li><b>R-02</b> passes when the difference is at most 1% of the item total.</li>
          <li><b>R-05</b> uses the carrier we recommend (or the one you pick). If your priority’s first choice can’t take the pallet weight, we move to the next carrier that can and show why. If none can, R-05 is red.</li>
          <li><b>R-06</b> scans each item’s description for lithium batteries, aerosols and flammable liquids (e.g. power bank, hair spray, perfume, nail polish, solvents). Phrases like “battery-free” are ignored.</li>
          <li><b>R-07</b> compares the gross weight with the goods alone; packaging and pallets only add to it.</li>
          <li><b>R-10</b> compares the ready date with today’s date on your device.</li>
        </ul>
      </div>
      <div className="panel prose">
        <h2>How Pre-Flight works</h2>
        <div className="flow">
          <div><h3>Chat assistant</h3><p>Reads plain language, fills the booking, asks only for what is missing, and applies changes like “add a pallet” at any point.</p></div>
          <div><h3>Checking agent</h3><p>Runs the 10 rules plus extra checks after every change, explains each problem and its fix, and picks the carrier.</p></div>
          <div><h3>Automation</h3><p>Checks a whole uploaded file at once, applies fixes in one click, and exports the corrected file, an issues report and a draft commercial invoice.</p></div>
        </div>
        <h2 style={{ marginTop: 18 }}>Carrier choice</h2>
        <ul>
          <li><b>Cheapest</b> = lowest price × pallets. <b>Fastest</b> = shortest transit. <b>Most reliable</b> = highest on-time rate.</li>
          <li><b>Balanced</b> scores each carrier 0–1 on cost, speed and on-time rate (min–max across the route) and picks the highest <i>minimum</i> score, with ties broken by average then price.</li>
          <li>Only carriers that pass R-05 are eligible. You can override the carrier and switch back at any time.</li>
        </ul>
        <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>Everything runs in your browser. No login, no API key, and the same input always gives the same result.</p>
      </div>
    </div>
  );
}
