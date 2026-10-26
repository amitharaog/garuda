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
