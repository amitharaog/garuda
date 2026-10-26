/* Book by chat: the conversation log, chips, composer, and the live booking panel beside it. */
import { useEffect, useRef, useState } from 'react';
import { money, niceDate } from '../domain';
import type { Action } from '../domain';
import type { BotMessage, Conversation } from '../chat/conversation';
import { CarrierPick } from './components/carrier';
import { IssueList, StatusBar, isBlocking } from './components/results';
import { NextSteps, ShippingLabel } from './components/confirmation';
import { BookingPanel } from './BookingPanel';
import { toast } from './util';
import { bestAlternative, mergeSegments, normalizeSpeech } from '../chat/speech';

export type LogEntry = { id: number } & ({ role: 'user'; text: string } | { role: 'bot'; msg: BotMessage } | { role: 'greet' });

export interface ChatActions {
  send: (text: string) => void;
  fix: (action: Action) => void;
  /** Apply several fixes as one step (a cheaper option). */
  applyAlt: (actions: Action[], label: string) => void;
  carrier: (key: string | null) => void;
  edit: (field: string, value: string | number | null, item?: number) => void;
  addItem: () => void;
  removeItem: (i: number) => void;
  invoice: () => void;
  print: () => void;
  share: () => void;
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

function Greeting({ act, conv }: { act: ChatActions; conv: Conversation }) {
  const last = conv.hasLastBooking();
  return (
    <div className="bubble">
      <b>Hi! Describe your shipment in your own words.</b> Say what you're sending, from where to where, and when. I'll ask only for what's missing, check it against the 10-rule rulebook and recommend a carrier.
      <div className="hint">You can change anything at any time (“add a pallet”, “change destination to Paris”) or edit the booking panel directly.</div>
      <div className="starter-list">
        <div className="eyebrow">Or try an example</div>
        {STARTERS.map(s => <button type="button" className="starter" key={s} onClick={() => act.send(s)}>{s}</button>)}
        {last && (
          <button type="button" className="starter repeat" onClick={() => act.send('repeat my last booking')}>
            ↻ Repeat your last booking: {last.seller}, {last.originCity} → {last.destCity} ({last.items.map(i => i.description).join(', ')})
          </button>
        )}
      </div>
    </div>
  );
}

interface Alternative { transcript: string }
interface RecResult { isFinal: boolean; length: number; [i: number]: Alternative }
type Recognition = {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((e: { resultIndex: number; results: ArrayLike<RecResult> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
  start: () => void; stop: () => void; abort: () => void;
};
const speechCtor = (): (new () => Recognition) | null => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};
/** Stop listening after this long without new words, and never listen longer than MAX_MS. */
const SILENCE_MS = 1800;
const MAX_MS = 45000;
const SPEECH_ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow it in the browser’s site settings to book by voice.',
  'service-not-allowed': 'Microphone access was blocked. Allow it in the browser’s site settings to book by voice.',
  'audio-capture': 'No microphone was found.',
  network: 'Voice needs an internet connection for speech recognition.',
  'no-speech': 'I didn’t hear anything. Tap the microphone and try again.',
};

/** Book by voice: listens through pauses, shows the words live, stops after a short silence and sends what was said,
    rewritten the way people type it (numbers, prices, weights, dates, city names). Esc cancels. */
function useVoice(onLive: (t: string) => void, onDone: (t: string) => void) {
  const [on, setOn] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const cancelled = useRef(false);
  const timers = useRef<{ silence?: number; max?: number }>({});
  const supported = typeof window !== 'undefined' && !!speechCtor();

  const clear = () => { window.clearTimeout(timers.current.silence); window.clearTimeout(timers.current.max); };
  const stop = () => rec.current?.stop();
  const cancel = () => { cancelled.current = true; rec.current?.abort(); };

  const start = () => {
    const Ctor = speechCtor();
    if (!Ctor || on) return;
    const r = new Ctor();
    r.lang = 'en-GB';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 3;
    const finals: string[] = [];
    let interim = '';
    cancelled.current = false;
    r.onresult = e => {
      interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const alts = Array.from({ length: res.length }, (_, k) => res[k].transcript);
        if (res.isFinal) finals[i] = bestAlternative(alts);
        else interim = mergeSegments([interim, alts[0]]);
      }
      onLive(mergeSegments([...finals.filter(Boolean), interim]));
      window.clearTimeout(timers.current.silence);
      timers.current.silence = window.setTimeout(stop, SILENCE_MS);
    };
    r.onerror = e => {
      if (e.error === 'aborted') return;
      const msg = SPEECH_ERRORS[e.error];
      if (msg) toast(msg);
    };
    r.onend = () => {
      clear();
      setOn(false);
      rec.current = null;
      if (cancelled.current) { onLive(''); return; }
      const heard = mergeSegments([...finals.filter(Boolean), interim]);
      onDone(heard ? normalizeSpeech(heard) : '');
    };
    rec.current = r;
    setOn(true);
    timers.current.max = window.setTimeout(stop, MAX_MS);
    try { r.start(); } catch { setOn(false); }
  };

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on]);
  useEffect(() => () => { clear(); rec.current?.abort(); }, []);

  return { supported, on, start, stop, cancel };
}

const MicIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </svg>
);

/** Paste an order email or note; it goes through the same language understanding as typed messages. */
function PasteModal({ onSend, onClose }: { onSend: (t: string) => void; onClose: () => void }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Paste an order" style={{ maxWidth: 640 }}>
        <span className="eyebrow">Email, purchase order or notes</span>
        <h2 style={{ fontSize: 26, margin: '4px 0 6px', textTransform: 'uppercase' }}>Paste an order</h2>
        <p className="muted" style={{ marginTop: 0 }}>Paste the text as it is. Garuda picks out the seller, route, products, quantities, prices, weights and dates, then asks only for what is missing.</p>
        <label htmlFor="paste-text" className="sr-only">Order text</label>
        <textarea id="paste-text" ref={ref} className="paste-area" rows={10} value={text} onChange={e => setText(e.target.value)}
          placeholder={'Hi team,\nPlease book 600 wool scarves for Pennine Textiles at £6 each, 20 per carton, 0.15 kg each, made in Turkey.\nCollection from Birmingham to our customer\'s shop in Lyon, ready 20-11-2026. Cheapest please.'} />
        <div className="row" style={{ justifyContent: 'flex-end', marginTop: 10 }}>
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" disabled={!text.trim()} onClick={() => { onSend(text.trim()); onClose(); }}>Read this order</button>
        </div>
      </div>
    </div>
  );
}

export function ChatView({ conv, log, act, version }: { conv: Conversation; log: LogEntry[]; act: ChatActions; version: number }) {
  const [draft, setDraft] = useState('');
  const [pasting, setPasting] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  // Voice: the words appear in the box as they are heard, and are sent when the speaker pauses.
  const voiceBase = useRef('');
  const voice = useVoice(
    live => setDraft(live ? (voiceBase.current ? voiceBase.current + ' ' : '') + live : voiceBase.current),
    said => {
      const base = voiceBase.current;
      voiceBase.current = '';
      if (!said) { setDraft(base); return; } // heard nothing: keep what was typed, send nothing
      setDraft('');
      act.send([base, said].filter(Boolean).join(' '));
    },
  );
  const startVoice = () => { voiceBase.current = draft.trim(); voice.start(); };

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
            <button type="button" className="btn small" onClick={() => setPasting(true)} title="Paste an order email">Paste order</button>
            <button type="button" className="btn small" title="Undo last change" onClick={() => act.send('undo')}>Undo</button>
            <button type="button" className="btn small" onClick={act.reset}>New booking</button>
          </div>
        </div>
        <div className="log" ref={logRef} aria-live="polite" data-testid="chat-log">
          {log.map(e => (
            <div key={e.id} className={`msg ${e.role === 'user' ? 'user' : 'bot'}`}>
              {e.role === 'user' ? e.text : e.role === 'greet' ? <Greeting act={act} conv={conv} /> : <BotBubble msg={e.msg} conv={conv} act={act} />}
            </div>
          ))}
        </div>
        {voice.on && (
          <div className="voice-status" role="status">
            <span className="voice-dot" aria-hidden="true" />
            <span>Listening… say the whole shipment. I’ll send it when you pause.</span>
            <button type="button" className="btn small" onClick={voice.cancel}>Cancel</button>
          </div>
        )}
        <form className="composer" onSubmit={e => { e.preventDefault(); submit(); }}>
          <label htmlFor="chat-input" className="sr-only">Message</label>
          <textarea
            id="chat-input" ref={inputRef} rows={1} value={draft} readOnly={voice.on}
            placeholder={voice.on ? 'Listening…' : 'Type or speak your shipment details…'}
            onChange={e => {
              setDraft(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px';
            }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
          />
          {voice.supported && (
            <button type="button" className={`btn mic ${voice.on ? 'on' : ''}`} onClick={voice.on ? voice.stop : startVoice}
              aria-pressed={voice.on} aria-label={voice.on ? 'Stop and send' : 'Speak your shipment'} title={voice.on ? 'Stop and send' : 'Speak your shipment'}>
              {voice.on ? <span className="mic-stop" aria-hidden="true" /> : <MicIcon />}
            </button>
          )}
          <button className="btn primary" type="submit" disabled={voice.on}>Send</button>
        </form>
      </div>
      <BookingPanel conv={conv} act={act} version={version} />
      {pasting && <PasteModal onSend={t => act.send(t)} onClose={() => setPasting(false)} />}
    </div>
  );
}
