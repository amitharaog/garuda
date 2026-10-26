/* Turning browser speech-recognition results into one clean sentence.
   Some Chrome builds report each growing hypothesis ("check H", "can you check hatches", "can you check HSN code")
   as a separate result, so joining every result repeats the sentence. Merge them instead. */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Merge recognition results in order: a result that extends or restates what came before replaces it. */
export function mergeTranscripts(parts: string[]): string {
  let out = '';
  for (const raw of parts) {
    const p = raw.trim();
    if (!p) continue;
    const a = norm(out), b = norm(p);
    if (!a) out = p;
    else if (b.startsWith(a) || b.includes(a)) out = p; // the new hypothesis contains everything so far
    else if (a.endsWith(b) || a.includes(b)) continue; // nothing new
    else if (sharesStart(a, b)) out = p; // a revision of the same sentence ("check H" → "can you check HSN")
    else out = `${out} ${p}`; // a genuinely new phrase
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** True when b looks like a rewrite of a: most of a's words reappear in b. */
function sharesStart(a: string, b: string): boolean {
  const aw = a.split(' '), bw = new Set(b.split(' '));
  const shared = aw.filter(w => bw.has(w)).length;
  return aw.length > 0 && shared / aw.length >= 0.5;
}

export interface SpeechResultLike {
  isFinal?: boolean;
  0: { transcript: string };
}

/** The text to show while listening: merged final results, then the current interim guess. */
export function liveTranscript(results: ArrayLike<SpeechResultLike>): { final: string; interim: string } {
  const finals: string[] = [], interims: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    (r.isFinal === false ? interims : finals).push(r[0]?.transcript || '');
  }
  const final = mergeTranscripts(finals);
  const interim = mergeTranscripts(interims);
  const nf = norm(final), ni = norm(interim);
  // Drop an interim guess that only repeats what is already final.
  return { final, interim: !ni || nf.endsWith(ni) || nf.includes(ni) ? '' : interim };
}
