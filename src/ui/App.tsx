/* App shell: tabs, chat state, file state, and the link between them ("Fix in chat" syncs changes back to the file).
   Also owns share links, saved sellers/products and the print pack. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyAction, check, fixAllSafe, normalizeBooking } from '../domain';
import type { Action, Booking, CheckResult } from '../domain';
import { Conversation } from '../chat/conversation';
import type { BotMessage } from '../chat/conversation';
import { fromRows } from '../io/assemble';
import type { ReadResult } from '../io/assemble';
import { SHARE_PREFIX, decodeBooking, shareUrl } from '../io/share';
import { loadProfiles, rememberBooking } from '../io/profiles';
import { SAMPLE_BOOKING_ROWS, SAMPLE_ITEM_ROWS, SAMPLE_NAME } from '../data/sample';
import { ChatView } from './ChatView';
import type { ChatActions, LogEntry } from './ChatView';
import { FileView } from './FileView';
import type { FileActions, FileState } from './FileView';
import { RulesView } from './RulesView';
import { InsightsView } from './InsightsView';
import { InvoiceModal } from './components/InvoiceModal';
import { PrintModal } from './components/PrintModal';
import { copyText, safeStorage, toast } from './util';
import { Header, Loader } from './site/Chrome';
import { Carriers, Cases, Faq, Footer, Hero, Intro, RulesBand } from './site/Sections';
import { JourneyLoad, JourneySea, JourneySky } from './site/Journey';
import { initSmoothScroll, reducedMotion, scrollToEl } from './site/motion';
import './site/site.css';

type View = 'chat' | 'file' | 'insights' | 'rules';
type Page = 'home' | 'book';
type Section = 'book' | 'insights' | 'rules';
/** Top-level sections of the booking page; "Book a shipment" holds the two ways to book (chat or file). */
const SECTIONS: Array<[Section, string]> = [['book', 'Book a shipment'], ['insights', 'Insights'], ['rules', 'Rules']];
const MODES: Array<[View, string, string]> = [['chat', 'Book by chat', 'Describe it in plain words'], ['file', 'Check a file', 'Upload a workbook or CSVs']];
const sectionOf = (v: View): Section => (v === 'chat' || v === 'file' ? 'book' : v);
const hash = () => (typeof location !== 'undefined' ? location.hash : '').slice(1);
const viewFromHash = (): View => {
  const h = hash();
  return h === 'file' || h === 'rules' || h === 'insights' ? h : 'chat';
};
/** Home is `/`; the booking page is any console view (#chat, #file, #insights, #rules) or a shared booking. */
const pageFromHash = (): Page => (/^(chat|file|insights|rules)$/.test(hash()) || hash().startsWith(SHARE_PREFIX) ? 'book' : 'home');

function fileStateFrom(read: ReadResult, name: string): FileState {
  const firstRed = read.bookings.find(b => check(b).status === 'Red') || read.bookings[0];
  return { bookings: read.bookings, original: read.bookings, warnings: read.warnings, name, overrides: {}, confirmed: {}, filter: 'All', sel: firstRed ? firstRed.id : null };
}
const sampleState = () => fileStateFrom(fromRows(SAMPLE_BOOKING_ROWS, SAMPLE_ITEM_ROWS), SAMPLE_NAME);
const storage = safeStorage();

export function App() {
  const convRef = useRef<Conversation | null>(null);
  if (!convRef.current) {
    convRef.current = new Conversation();
    convRef.current.setMemory(loadProfiles(storage));
  }
  const conv = convRef.current;
  const nextId = useRef(1);
  const [log, setLog] = useState<LogEntry[]>([{ id: 0, role: 'greet' }]);
  const [version, setVersion] = useState(0);
  const [view, setView] = useState<View>(viewFromHash);
  const [fs, setFs] = useState<FileState>(sampleState);
  const [fileLink, setFileLink] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<{ booking: Booking; result: CheckResult } | null>(null);
  const [printing, setPrinting] = useState<{ result: CheckResult; reference: string | null } | null>(null);
  /** Which way to book was used last, so "Book a shipment" reopens it. */
  const bookMode = useRef<View>(viewFromHash() === 'file' ? 'file' : 'chat');

  const [page, setPage] = useState<Page>(pageFromHash);
  const [wipe, setWipe] = useState<'idle' | 'in' | 'out'>('idle');
  const closeInvoice = useCallback(() => setInvoice(null), []);
  const closePrint = useCallback(() => setPrinting(null), []);
  const results = useMemo(() => fs.bookings.map(b => check(b, { carrierOverride: fs.overrides[b.id] })), [fs.bookings, fs.overrides]);

  /** Change page behind a circle wipe, like the reference site's page transition. */
  const pendingScroll = useRef<string | null>(null);
  const goPage = useCallback((next: Page, url: string, anchor: string | null = null) => {
    const swap = () => {
      try { history.pushState(null, '', url); } catch { /* sandboxed */ }
      pendingScroll.current = anchor;
      setPage(next);
      if (!anchor) window.scrollTo(0, 0);
    };
    if (reducedMotion()) { swap(); return; }
    setWipe('in');
    setTimeout(() => { swap(); setWipe('out'); }, 520);
    setTimeout(() => setWipe('idle'), 1250);
  }, []);
  // After a page change, jump to the requested home section.
  useEffect(() => {
    const id = pendingScroll.current;
    if (!id) return;
    pendingScroll.current = null;
    const el = document.getElementById(id);
    if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 60);
  }, [page]);

  /** Switch the console view; from the home page this opens the booking page. */
  const show = useCallback((v: View) => {
    if (v === 'chat' || v === 'file') bookMode.current = v;
    setView(v);
    if (pageFromHash() === 'book') {
      try { history.replaceState(null, '', '#' + v); } catch { /* sandboxed */ }
      window.scrollTo(0, 0);
    } else goPage('book', '#' + v);
  }, [goPage]);
  const home = useCallback((anchor: string | null = null) => {
    if (pageFromHash() === 'home') {
      const el = anchor ? document.getElementById(anchor) : null;
      if (el) scrollToEl(el, -60); else window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    } else goPage('home', location.pathname + location.search, anchor);
  }, [goPage]);
  useEffect(() => {
    initSmoothScroll();
    const onNav = () => {
      setPage(pageFromHash());
      if (!location.hash.startsWith('#' + SHARE_PREFIX)) setView(viewFromHash());
    };
    window.addEventListener('hashchange', onNav);
    window.addEventListener('popstate', onNav);
    return () => { window.removeEventListener('hashchange', onNav); window.removeEventListener('popstate', onNav); };
  }, []);
  const links = [
    { label: 'Home', go: () => home() },
    { label: 'Book a shipment', go: () => show('chat') },
    { label: 'Check a file', go: () => show('file') },
    { label: 'Insights', go: () => show('insights') },
    { label: 'Rules', go: () => show('rules') },
    { label: 'How it works', go: () => home('how') },
    { label: 'Carriers', go: () => home('carriers') },
    { label: 'FAQ', go: () => home('faq') },
  ];

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

  /** Run one conversation step: log the user's words, the bot's reply, re-render, sync, and remember confirmed bookings. */
  const run = useCallback((userText: string | null, step: () => BotMessage[]) => {
    let out: BotMessage[];
    try { out = step(); } catch (e) {
      console.error(e);
      out = [{ kind: 'text', html: 'Something went wrong reading that. Try rephrasing, or edit the field in the booking panel.' }];
    }
    if (out.some(m => m.kind === 'confirmation')) conv.setMemory(rememberBooking(storage, normalizeBooking(conv.toBooking())));
    const entries: LogEntry[] = [];
    if (userText) entries.push({ id: nextId.current++, role: 'user', text: userText });
    out.forEach(msg => entries.push({ id: nextId.current++, role: 'bot', msg }));
    setLog(l => [...l, ...entries]);
    setVersion(v => v + 1);
    syncBack();
  }, [conv, syncBack]);

  const openShared = useCallback((booking: Booking, carrierOverride: string | null) => {
    setFileLink(null);
    const msgs = conv.loadBooking(booking, { carrierOverride, source: 'link' });
    setLog(msgs.map(msg => ({ id: nextId.current++, role: 'bot' as const, msg })));
    setVersion(v => v + 1);
    show('chat');
  }, [conv, show]);

  // A shared link (#share=...) opens that booking in the chat.
  useEffect(() => {
    const h = location.hash;
    if (!h.startsWith('#' + SHARE_PREFIX)) return;
    const d = decodeBooking(h.slice(1 + SHARE_PREFIX.length));
    if (d) { openShared(d.booking, d.carrierOverride); toast(`Opened shared booking ${d.booking.id}`); }
    else { toast('That share link could not be read'); show('chat'); }
  }, []);

  const share = (b: Booking, override: string | null) => copyText(shareUrl(location.href, b, override));

  const chat: ChatActions = {
    send: t => run(t, () => conv.handle(t)),
    fix: a => run(a.label || 'Apply fix', () => conv.applyFix(a)),
    applyAlt: (actions, label) => run(`Use ${label}`, () => conv.applyFixes(actions, label)),
    carrier: key => run(key ? `Use ${key}` : 'Use the recommended carrier', () => conv.applyFix({ type: 'carrier', value: key, label: key ? `carrier → ${key}` : 'recommended carrier' })),
    edit: (field, value, item) => run(null, () => conv.editField(field, value, item ?? null)),
    addItem: () => run(null, () => conv.addItemFromPanel()),
    removeItem: i => run(`Remove item ${i + 1}`, () => conv.removeItemFromPanel(i)),
    invoice: () => setInvoice({ booking: normalizeBooking(conv.toBooking()), result: conv.result() }),
    print: () => setPrinting({ result: conv.result(), reference: conv.confirmed }),
    share: () => share(normalizeBooking(conv.toBooking()), conv.carrierOverride),
    reset: () => {
      conv.reset();
      setFileLink(null);
      setLog([{ id: nextId.current++, role: 'greet' }]);
      setVersion(v => v + 1);
    },
    backToFile: fileLink ? () => { setFs(s => ({ ...s, sel: fileLink })); show('file'); } : null,
  };

  const updateBooking = (id: string, change: (b: Booking) => Booking, override?: string | null) => {
    const i = fs.bookings.findIndex(b => b.id === id);
    if (i < 0) return null;
    const bookings = fs.bookings.slice();
    bookings[i] = { ...change(bookings[i]), _row: bookings[i]._row };
    const overrides = { ...fs.overrides };
    if (override !== undefined) { if (override) overrides[id] = override; else delete overrides[id]; }
    const confirmed = { ...fs.confirmed };
    delete confirmed[id];
    setFs({ ...fs, bookings, overrides, confirmed });
    return { before: results[i], after: check(bookings[i], { carrierOverride: overrides[id] }) };
  };
  const statusToast = (label: string, d: { before: CheckResult; after: CheckResult } | null) =>
    d && toast(`${label}: now ${d.after.status}${d.before.status !== d.after.status ? ` (was ${d.before.status})` : ''}`);

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
        setFs({ bookings: [], original: [], warnings: [{ level: 'warn', text: 'Could not read the file: ' + (e as Error).message }], name, overrides: {}, confirmed: {}, filter: 'All', sel: null });
      }
    },
    loadSample: () => setFs(sampleState()),
    select: id => setFs(s => ({ ...s, sel: id })),
    filter: f => setFs(s => ({ ...s, filter: f })),
    fix: (action: Action) => {
      if (!fs.sel) return;
      const d = action.type === 'carrier'
        ? updateBooking(fs.sel, b => b, action.value)
        : updateBooking(fs.sel, b => normalizeBooking(applyAction(b, action)));
      statusToast(action.label || 'Updated', d);
    },
    applyAlt: (actions, label) => {
      if (!fs.sel) return;
      const carrier = actions.find(a => a.type === 'carrier');
      const d = updateBooking(fs.sel, b => actions.filter(a => a.type !== 'carrier').reduce((x, a) => normalizeBooking(applyAction(x, a)), b), carrier && carrier.type === 'carrier' ? carrier.value : undefined);
      statusToast(label, d);
    },
    fixAllSafe: () => {
      let fixes = 0, touched = 0;
      const bookings = fs.bookings.map(b => {
        const r = fixAllSafe(b, fs.overrides[b.id]);
        if (r.applied.length) { fixes += r.applied.length; touched++; }
        return r.applied.length ? { ...r.booking, _row: b._row } : b;
      });
      if (!fixes) { toast('Nothing safe to fix automatically: the remaining issues need a decision'); return; }
      const confirmed = { ...fs.confirmed };
      bookings.forEach((b, i) => { if (b !== fs.bookings[i]) delete confirmed[b.id]; });
      setFs({ ...fs, bookings, confirmed });
      const left = bookings.map(b => check(b, { carrierOverride: fs.overrides[b.id] })).filter(r => r.status === 'Red').length;
      toast(`Applied ${fixes} safe fix${fixes > 1 ? 'es' : ''} in ${touched} booking${touched > 1 ? 's' : ''}. ${left} still need${left === 1 ? 's' : ''} a decision.`);
    },
    confirm: () => {
      const r = results.find(x => x.booking.id === fs.sel);
      if (!r || r.status === 'Red' || !fs.sel) return;
      const ref = 'PF-' + fs.sel.replace(/\W/g, '') + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
      setFs(s => ({ ...s, confirmed: { ...s.confirmed, [fs.sel as string]: ref } }));
      conv.setMemory(rememberBooking(storage, r.booking));
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
    print: () => {
      const r = results.find(x => x.booking.id === fs.sel);
      if (r) setPrinting({ result: r, reference: fs.confirmed[r.booking.id] || null });
    },
    share: () => {
      const r = results.find(x => x.booking.id === fs.sel);
      if (r) share(r.booking, fs.overrides[r.booking.id] || null);
    },
  };

  const section = sectionOf(view);

  return (
    <>
      {page === 'home' && <Loader />}
      <Header links={links} current={page === 'home' ? 'Home' : 'Book a shipment'} solid={page === 'book'} onCta={() => show('chat')} />
      {page === 'home' ? (
        <>
          <Hero onChat={() => show('chat')} onFile={() => show('file')} />
          <Intro onRules={() => show('rules')} />
          <JourneyLoad go={show} />
          <JourneySea />
          <JourneySky />
          <Cases />
          <Carriers />
          <RulesBand onAll={() => show('rules')} />
          <Faq onChat={() => show('chat')} />
          <Footer links={links.slice(0, 5)} current="Home" onChat={() => show('chat')} />
        </>
      ) : (
        <>
          <section className="console book-page" id="console" data-header="light" aria-labelledby="console-title">
            <div className="console-head wrap">
              <div>
                <nav className="crumbs mono-s" aria-label="Breadcrumb">
                  <button type="button" onClick={() => home()}>HOME</button><span>/</span><span>BOOK A SHIPMENT</span>
                </nav>
                <h1 className="h1 two-tone" id="console-title"><span className="mute">BOOK IT. CHECK IT.</span> <span>SHIP IT.</span></h1>
                <p className="console-sub">Describe a shipment in plain words or drop in a file. Every booking is checked against the 10-rule rulebook, matched to a carrier and confirmed in one place.</p>
              </div>
              <nav className="tabs" role="tablist" aria-label="Sections">
                {SECTIONS.map(([sec, label]) => (
                  <button key={sec} type="button" role="tab" id={`tab-${sec}`} aria-controls={`section-${sec}`} aria-selected={section === sec}
                    onClick={() => show(sec === 'book' ? bookMode.current : sec)}>
                    {label}
                  </button>
                ))}
              </nav>
            </div>
            <main className="wrap">
              <section id="section-book" role="tabpanel" aria-labelledby="tab-book" hidden={section !== 'book'}>
                <div className="book-modes" role="tablist" aria-label="How to book">
                  {MODES.map(([v, label, hint]) => (
                    <button key={v} type="button" role="tab" id={`tab-${v}`} aria-controls={`view-${v}`} aria-selected={view === v} onClick={() => show(v)}>
                      <b>{label}</b><span>{hint}</span>
                    </button>
                  ))}
                </div>
                <section className="view" id="view-chat" role="tabpanel" aria-labelledby="tab-chat" hidden={view !== 'chat'}>
                  <ChatView conv={conv} log={log} act={chat} version={version} />
                </section>
                <section className="view" id="view-file" role="tabpanel" aria-labelledby="tab-file" hidden={view !== 'file'}>
                  <FileView fs={fs} results={results} act={file} />
                </section>
              </section>
              <section className="view" id="view-insights" role="tabpanel" aria-labelledby="tab-insights" hidden={view !== 'insights'}>
                <InsightsView results={results} bookings={fs.bookings} overrides={fs.overrides} name={fs.name} onOpen={id => { file.select(id); show('file'); }} />
              </section>
              <section className="view" id="view-rules" role="tabpanel" aria-labelledby="tab-rules" hidden={view !== 'rules'}>
                <RulesView />
              </section>
            </main>
          </section>
          <Footer links={links.slice(0, 5)} current="Book a shipment" onChat={() => show('chat')} cta={false} />
        </>
      )}
      <div className={`wipe ${wipe}`} aria-hidden="true" />
      {invoice && <InvoiceModal booking={invoice.booking} result={invoice.result} onClose={closeInvoice} />}
      {printing && <PrintModal result={printing.result} reference={printing.reference} onClose={closePrint} />}
    </>
  );
}
