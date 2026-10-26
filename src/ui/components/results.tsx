/* Shared result renderers: status bar, issue cards, the 10-rule checklist. */
import { RULES, statusLabel, uniq } from '../../domain';
import type { Action, CheckResult, Issue } from '../../domain';

export type OnFix = (action: Action) => void;

export function StatusBar({ r }: { r: CheckResult }) {
  const counts = [r.red ? `${r.red} red` : '', r.amber ? `${r.amber} amber` : ''].filter(Boolean).join(' · ') || 'all 10 checks passed';
  return (
    <div className={`statusbar ${r.status}`} role="status">
      <span className="big">{r.status === 'Red' ? 'On hold' : r.status === 'Amber' ? 'Check warnings' : 'Ready to book'}</span>
      <span>{statusLabel(r)}: {counts}</span>
    </div>
  );
}

export function IssueCard({ issue, onFix }: { issue: Issue; onFix?: OnFix }) {
  return (
    <div className={`issue ${issue.severity}`} data-rule={issue.rule}>
      <div className="issue-head">
        <span className="rid">{issue.rule}</span>
        <span className="sev">{issue.severity}</span>
        <b>{issue.title}</b>
        {issue.extra && <span className="tag">extra check</span>}
      </div>
      <p>{issue.what}</p>
      <p className="fix"><strong>How to fix:</strong> {issue.fix}</p>
      {issue.dg && (
        <details className="dg">
          <summary>Dangerous goods: {issue.dg.un} · {issue.dg.cls}</summary>
          <ul>{issue.dg.needs.map(n => <li key={n}>{n}</li>)}</ul>
        </details>
      )}
      {onFix && issue.fixes && issue.fixes.length > 0 && (
        <div className="fixes">
          {issue.fixes.map(f => (
            <button key={f.label} type="button" className="btn small" onClick={() => onFix({ ...f.action, label: f.label })}>{f.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export function IssueList({ r, filter, onFix }: { r: CheckResult; filter?: (i: Issue) => boolean; onFix?: OnFix }) {
  const list = filter ? r.issues.filter(filter) : r.issues;
  if (!list.length) return <p className="muted" style={{ margin: 0 }}>No problems found.</p>;
  return (
    <div className="issues">
      {list.map((i, k) => <IssueCard key={`${i.rule}-${i.itemIndex ?? ''}-${k}`} issue={i} onFix={onFix} />)}
    </div>
  );
}

export const isBlocking = (i: Issue) => i.severity !== 'Info';
export const isInfo = (i: Issue) => i.severity === 'Info';

/** Blocking issues, then advisory notes in a fold. */
export function IssuesWithNotes({ r, onFix }: { r: CheckResult; onFix?: OnFix }) {
  const infos = r.issues.filter(isInfo);
  return (
    <>
      <IssueList r={r} filter={isBlocking} onFix={onFix} />
      {infos.length > 0 && (
        <details className="more">
          <summary>{infos.length} advisory note{infos.length > 1 ? 's' : ''}</summary>
          <div style={{ marginTop: 8 }}><IssueList r={r} filter={isInfo} onFix={onFix} /></div>
        </details>
      )}
    </>
  );
}

export function Checklist({ r }: { r: CheckResult }) {
  return (
    <div className="checklist">
      {RULES.map(rule => {
        const fails = r.issues.filter(i => i.rule === rule.id && (i.severity === 'Red' || i.severity === 'Amber'));
        const pass = r.passed[rule.id];
        let cls: string, ic: string, sub: string, label: string;
        if (fails.length) {
          cls = 'fail-' + rule.severity; ic = '✕'; label = 'failed';
          const skus = uniq(fails.filter(f => f.itemIndex !== undefined).map(f => r.booking.items[f.itemIndex as number]?.sku).filter(Boolean));
          sub = `${fails.length} problem${fails.length > 1 ? 's' : ''}${skus.length ? ' · ' + skus.join(', ') : ''}`;
        } else if (pass) { cls = 'pass'; ic = '✓'; sub = pass; label = 'passed'; }
        else { cls = 'na'; ic = '–'; sub = 'Not checked yet: data missing'; label = 'not checked'; }
        return (
          <div className={`check ${cls}`} key={rule.id} data-rule={rule.id}>
            <span className="ic" aria-label={label}>{ic}</span>
            <span className="rid">{rule.id}</span>
            <span>{rule.text} <span className="tag">{rule.severity}</span><small>{sub}</small></span>
          </div>
        );
      })}
    </div>
  );
}
