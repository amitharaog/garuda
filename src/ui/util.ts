/* Browser helpers: toast, clipboard, workbook download. */
import type { WorkBook } from 'xlsx';

type Writer = typeof import('../io/writeWorkbook');

export function toast(text: string): void {
  const d = document.createElement('div');
  d.className = 'toast';
  d.setAttribute('role', 'status');
  d.textContent = text;
  document.body.appendChild(d);
  setTimeout(() => d.remove(), 2600);
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('Copied to clipboard');
    } catch {
      toast('Select the text and copy it manually');
    }
    ta.remove();
  }
}

/** Build a workbook with the (lazily loaded) writer and save it. */
export async function downloadWorkbook(build: (w: Writer) => WorkBook, name: string): Promise<void> {
  try {
    const w = await import('../io/writeWorkbook');
    const bytes = w.workbookBytes(build(w));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    toast('Download failed: ' + (e as Error).message);
  }
}

/** localStorage when the browser allows it (private windows and sandboxes may not). */
export function safeStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const k = '__garuda_probe';
    s.setItem(k, '1');
    s.removeItem(k);
    return s;
  } catch {
    return null;
  }
}

/** Print an HTML document through a hidden frame (the browser's dialog also offers "Save as PDF"). */
export function printHtml(html: string): void {
  const f = document.createElement('iframe');
  f.setAttribute('aria-hidden', 'true');
  Object.assign(f.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  f.srcdoc = html;
  f.onload = () => {
    try { f.contentWindow?.focus(); f.contentWindow?.print(); } catch { toast('Printing was blocked; use "Open in a new tab" instead'); }
    setTimeout(() => f.remove(), 60_000);
  };
  document.body.appendChild(f);
}

/** Open an HTML document in a new tab (a fallback when printing from a frame is blocked). */
export function openHtml(html: string): void {
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
  const w = window.open(url, '_blank');
  if (!w) toast('Pop-up blocked: allow pop-ups for this site to open the documents');
  else w.opener = null;
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
