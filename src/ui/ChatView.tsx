/* Book by chat: the conversation log, chips, composer, and the live booking panel beside it. */
import { useEffect, useRef, useState } from 'react';
import { money, niceDate } from '../domain';
import type { Action } from '../domain';
import type { BotMessage, Conversation } from '../chat/conversation';
import { CarrierPick } from './components/carrier';
import { IssueList, StatusBar, isBlocking } from './components/results';
import { NextSteps, ShippingLabel } from './components/confirmation';
import { BookingPanel } from './BookingPanel';

export type LogEntry = { id: number } & ({ role: 'user'; text: string } | { role: 'bot'; msg: BotMessage } | { role: 'greet' });

export interface ChatActions {
  send: (text: string) => void;
  fix: (action: Action) => void;
  carrier: (key: string | null) => void;
  edit: (field: string, value: string | number | null, item?: number) => void;
  addItem: () => void;
  removeItem: (i: number) => void;
  invoice: () => void;
  reset: () => void;
  backToFile: (() => void) | null;
}

export const STARTERS = [
  "We're Northfield Goods. 3 pallets of ceramic coffee mugs from Manchester to an Amazon warehouse in Frankfurt, 1,080 mugs at £5 each, 12 per carton, 0.5 kg each. Ready 12-11-2026, cheapest please.",
  'I need to send 500 cotton t-shirts at £3 each from Leeds to a shop in Lyon next Monday. Fastest option.',
  'Harbour Tech here, shipping power banks and USB cables from London to a warehouse in Amsterdam.',
];

/** Chips are shown as friendly text but sent as the phrase the parser expects. */
const chipToText = (c: string) => c.replace(/^Use estimate.*$/, 'use estimate').replace(/^Use (\d+)$/, 'use suggested');

function BotBubble({ msg, conv, act }: { msg: BotMessage; conv: Conversation; act: ChatActions }) {
  if (msg.kind === 'text')
    return (
      <div className="bubble">
        <div dangerouslySetInnerHTML={{ __html: msg.html }} />
        {msg.hint && <div className="hint">{msg.hint}</div>}
        {msg.chips && msg.chips.length > 0 && (
          <div className="chips">
            {msg.chips.map(c => <button type="button" className="chip" key={c} onClick={() => act.send(chipToText(c))}>{c}</button>)}
          </div>
        )}
        {msg.confirmActions && (
          <div className="chips">
            <button type="button" className="btn primary small" onClick={() => act.send('confirm')}>Confirm booking</button>
            <button type="button" className="btn small" onClick={act.invoice}>Invoice draft</button>
          </div>
        )}
      </div>
    );
  if (msg.kind === 'review') {
    const r = msg.result;
    if (msg.compact)
      return (
        <div className="bubble">
          <StatusBar r={r} />
          {r.rec.chosen && <div style={{ marginTop: 6, fontSize: 14 }}>Carrier: <b>{r.rec.chosen.key}</b> · {money(r.rec.chosen.cost)} · ETA {niceDate(r.eta)}</div>}
          {r.status !== 'Red' && conv.isComplete() && (
            <div className="chips"><button type="button" className="btn primary small" onClick={() => act.send('confirm')}>Confirm booking</button></div>
          )}
        </div>
      );
    if (msg.partial) return <div className="bubble"><IssueList r={r} filter={i => i.severity === 'Red' || i.severity === 'Amber'} onFix={act.fix} /></div>;
    return (
      <div className="bubble">
        <StatusBar r={r} />
        <div style={{ marginTop: 10 }}><IssueList r={r} filter={isBlocking} onFix={act.fix} /></div>
        <div className="bubble-sep"><CarrierPick r={r} /><div className="hint">Compare all carriers in the booking panel.</div></div>
      </div>
    );
  }
  return (
    <div className="bubble">
      <div style={{ marginBottom: 10 }}>Booked. Here is your confirmation; keep the reference.</div>
      <ShippingLabel r={msg.result} reference={msg.ref} />
      <div style={{ marginTop: 12 }}><NextSteps r={msg.result} /></div>
      <div className="chips">
        <button type="button" className="btn small" onClick={act.invoice}>Commercial invoice draft</button>
        <button type="button" className="btn small" onClick={() => act.send('start over')}>Start a new booking</button>
      </div>
    </div>
  );
}

function Greeting({ act }: { act: ChatActions }) {
  return (
    <div className="bubble">
      <b>Hi! Describe your shipment in your own words.</b> Say what you're sending, from where to where, and when. I'll ask only for what's missing, check it against the 10-rule rulebook and recommend a carrier.
      <div className="hint">You can change anything at any time (“add a pallet”, “change destination to Paris”) or edit the booking panel directly.</div>
      <div className="starter-list">
        <div className="eyebrow">Or try an example</div>
        {STARTERS.map(s => <button type="button" className="starter" key={s} onClick={() => act.send(s)}>{s}</button>)}
      </div>
    </div>
  );
}

export function ChatView({ conv, log, act, version }: { conv: Conversation; log: LogEntry[]; act: ChatActions; version: number }) {
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    if (inputRef.current) inputRef.current.style.height = '';
    act.send(t);
  };

  return (
    <div className="chat-layout">
      <div className="panel chat">
        <div className="chat-head">
          <h2>Booking assistant</h2>
          <div className="row">
            <button type="button" className="btn small" title="Undo last change" onClick={() => act.send('undo')}>Undo</button>
            <button type="button" className="btn small" onClick={act.reset}>New booking</button>
          </div>
        </div>
        <div className="log" ref={logRef} aria-live="polite" data-testid="chat-log">
          {log.map(e => (
            <div key={e.id} className={`msg ${e.role === 'user' ? 'user' : 'bot'}`}>
              {e.role === 'user' ? e.text : e.role === 'greet' ? <Greeting act={act} /> : <BotBubble msg={e.msg} conv={conv} act={act} />}
            </div>
          ))}
        </div>
        <form className="composer" onSubmit={e => { e.preventDefault(); submit(); }}>
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <textarea
            id="chat-input" ref={inputRef} rows={1} value={draft} placeholder="Type your shipment details or answer…"
            onChange={e => {
              setDraft(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px';
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          />
          <button className="btn primary" type="submit">Send</button>
        </form>
      </div>
      <BookingPanel conv={conv} act={act} version={version} />
    </div>
  );
}
