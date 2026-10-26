/* App shell: tabs, chat state, file state, and the link between them ("Fix in chat" syncs changes back to the file). */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyAction, check, normalizeBooking } from '../domain';
import type { Action, Booking, CheckResult } from '../domain';
import { Conversation } from '../chat/conversation';
import type { BotMessage } from '../chat/conversation';
import { fromRows } from '../io/assemble';
import type { ReadResult } from '../io/assemble';
import { SAMPLE_BOOKING_ROWS, SAMPLE_ITEM_ROWS, SAMPLE_NAME } from '../data/sample';
import { ChatView } from './ChatView';
import type { ChatActions, LogEntry } from './ChatView';
import { FileView } from './FileView';
import type { FileActions, FileState } from './FileView';
import { RulesView } from './RulesView';
import { InvoiceModal } from './components/InvoiceModal';
import { toast } from './util';

type View = 'chat' | 'file' | 'rules';
const VIEWS: Array<[View, string]> = [['chat', 'Book by chat'], ['file', 'Check a file'], ['rules', 'Rules']];
const viewFromHash = (): View => {
  const h = (typeof location !== 'undefined' ? location.hash : '').slice(1);
  return h === 'file' || h === 'rules' ? h : 'chat';
};

function fileStateFrom(read: ReadResult, name: string): FileState {
  const firstRed = read.bookings.find(b => check(b).status === 'Red') || read.bookings[0];
  return { bookings: read.bookings, warnings: read.warnings, name, overrides: {}, confirmed: {}, filter: 'All', sel: firstRed ? firstRed.id : null };
}
const sampleState = () => fileStateFrom(fromRows(SAMPLE_BOOKING_ROWS, SAMPLE_ITEM_ROWS), SAMPLE_NAME);

export function App() {
  const convRef = useRef<Conversation | null>(null);
  if (!convRef.current) convRef.current = new Conversation();
  const conv = convRef.current;
  const nextId = useRef(1);
  const [log, setLog] = useState<LogEntry[]>([{ id: 0, role: 'greet' }]);
  const [version, setVersion] = useState(0);
  const [view, setView] = useState<View>(viewFromHash);
  const [fs, setFs] = useState<FileState>(sampleState);
  const [fileLink, setFileLink] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<{ booking: Booking; result: CheckResult } | null>(null);

  const closeInvoice = useCallback(() => setInvoice(null), []);
  const results = useMemo(() => fs.bookings.map(b => check(b, { carrierOverride: fs.overrides[b.id] })), [fs.bookings, fs.overrides]);

  const show = useCallback((v: View) => {
    setView(v);
    try { history.replaceState(null, '', '#' + v); } catch { /* sandboxed */ }
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  /** Push the chat's booking back into the file results while "Fix in chat" is active. */
  const syncBack = useCallback(() => {
    if (!fileLink || conv.mode !== 'file') return;
    const updated = normalizeBooking(conv.toBooking());
    setFs(s => {
      const i = s.bookings.findIndex(b => b.id === fileLink);
      if (i < 0) return s;
      const bookings = s.bookings.slice();
      bookings[i] = { ...updated, _row: s.bookings[i]._row };
      const overrides = { ...s.overrides };
      if (conv.carrierOverride) overrides[fileLink] = conv.carrierOverride; else delete overrides[fileLink];
      const confirmed = { ...s.confirmed };
      if (conv.confirmed) confirmed[fileLink] = conv.confirmed; else delete confirmed[fileLink];
      return { ...s, bookings, overrides, confirmed };
    });
  }, [conv, fileLink]);

  /** Run one conversation step: log the user's words, the bot's reply, re-render, sync. */
  const run = useCallback((userText: string | null, step: () => BotMessage[]) => {
    let out: BotMessage[];
    try { out = step(); } catch (e) {
      console.error(e);
      out = [{ kind: 'text', html: 'Something went wrong reading that. Try rephrasing, or edit the field in the booking panel.' }];
    }
    const entries: LogEntry[] = [];
    if (userText) entries.push({ id: nextId.current++, role: 'user', text: userText });
    out.forEach(msg => entries.push({ id: nextId.current++, role: 'bot', msg }));
    setLog(l => [...l, ...entries]);
    setVersion(v => v + 1);
    syncBack();
  }, [syncBack]);

  const chat: ChatActions = {
    send: t => run(t, () => conv.handle(t)),
    fix: a => run(a.label || 'Apply fix', () => conv.applyFix(a)),
    carrier: key => run(key ? `Use ${key}` : 'Use the recommended carrier', () => conv.applyFix({ type: 'carrier', value: key, label: key ? `carrier → ${key}` : 'recommended carrier' })),
    edit: (field, value, item) => run(null, () => conv.editField(field, value, item ?? null)),
    addItem: () => run(null, () => conv.addItemFromPanel()),
    removeItem: i => run(`Remove item ${i + 1}`, () => conv.removeItemFromPanel(i)),
    invoice: () => setInvoice({ booking: normalizeBooking(conv.toBooking()), result: conv.result() }),
    reset: () => {
      conv.reset();
      setFileLink(null);
      setLog([{ id: nextId.current++, role: 'greet' }]);
      setVersion(v => v + 1);
    },
    backToFile: fileLink ? () => { setFs(s => ({ ...s, sel: fileLink })); show('file'); } : null,
  };

  const fileFix = (action: Action) => {
    const id = fs.sel;
    const i = fs.bookings.findIndex(b => b.id === id);
    if (!id || i < 0) return;
    const before = results[i];
    const bookings = fs.bookings.slice();
    const overrides = { ...fs.overrides };
    if (action.type === 'carrier') { if (action.value) overrides[id] = action.value; else delete overrides[id]; }
    else bookings[i] = { ...normalizeBooking(applyAction(bookings[i], action)), _row: bookings[i]._row };
    const confirmed = { ...fs.confirmed };
    delete confirmed[id];
    setFs({ ...fs, bookings, overrides, confirmed });
    const after = check(bookings[i], { carrierOverride: overrides[id] });
    toast(`${action.label || 'Updated'}: now ${after.status}${before.status !== after.status ? ` (was ${before.status})` : ''}`);
  };

  const file: FileActions = {
    load: async files => {
      const name = files.map(f => f.name).join(', ');
      try {
        const data = await Promise.all(files.map(async f => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
        const { readFiles } = await import('../io/readWorkbook'); // SheetJS loads only when a file is read
        const read = readFiles(data);
        setFs(fileStateFrom(read, name));
        if (read.bookings.length) toast(`Checked ${read.bookings.length} booking${read.bookings.length > 1 ? 's' : ''}`);
      } catch (e) {
        console.error(e);
        setFs({ bookings: [], warnings: [{ level: 'warn', text: 'Could not read the file: ' + (e as Error).message }], name, overrides: {}, confirmed: {}, filter: 'All', sel: null });
      }
    },
    loadSample: () => setFs(sampleState()),
    select: id => setFs(s => ({ ...s, sel: id })),
    filter: f => setFs(s => ({ ...s, filter: f })),
    fix: fileFix,
    confirm: () => {
      const r = results.find(x => x.booking.id === fs.sel);
      if (!r || r.status === 'Red' || !fs.sel) return;
      const ref = 'PF-' + fs.sel.replace(/\W/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      setFs(s => ({ ...s, confirmed: { ...s.confirmed, [fs.sel as string]: ref } }));
      toast('Booking confirmed');
    },
    fixInChat: id => {
      const b = fs.bookings.find(x => x.id === id);
      if (!b) return;
      setFileLink(id);
      const msgs = conv.loadBooking(b, { carrierOverride: fs.overrides[id] || null, confirmed: fs.confirmed[id] || null });
      setLog(msgs.map(msg => ({ id: nextId.current++, role: 'bot' as const, msg })));
      setVersion(v => v + 1);
      show('chat');
    },
    invoice: () => {
      const r = results.find(x => x.booking.id === fs.sel);
      if (r) setInvoice({ booking: r.booking, result: r });
    },
  };

  return (
    <>
      <header className="top">
        <div className="wrap">
          <div className="brand">
            <h1>Pre<span>/</span>Flight</h1>
            <span className="route">UK → DE · FR · NL &nbsp;|&nbsp; book · check · fix before it ships</span>
          </div>
          <nav className="tabs" role="tablist" aria-label="Views">
            {VIEWS.map(([v, label]) => (
              <button key={v} type="button" role="tab" id={`tab-${v}`} aria-controls={`view-${v}`} aria-selected={view === v} onClick={() => show(v)}>{label}</button>
            ))}
          </nav>
        </div>
      </header>
      <main className="wrap">
        <section className="view" id="view-chat" role="tabpanel" aria-labelledby="tab-chat" hidden={view !== 'chat'}>
          <ChatView conv={conv} log={log} act={chat} version={version} />
        </section>
        <section className="view" id="view-file" role="tabpanel" aria-labelledby="tab-file" hidden={view !== 'file'}>
          <FileView fs={fs} results={results} act={file} />
        </section>
        <section className="view" id="view-rules" role="tabpanel" aria-labelledby="tab-rules" hidden={view !== 'rules'}>
          <RulesView />
        </section>
      </main>
      {invoice && <InvoiceModal booking={invoice.booking} result={invoice.result} onClose={closeInvoice} />}
    </>
  );
}
