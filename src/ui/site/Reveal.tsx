/* Scroll-scrubbed text reveal: letters (or words) go muted → blue → ink as the text crosses the viewport. */
import { useMemo, useRef } from 'react';
import type { ElementType, ReactNode } from 'react';
import { seg, useScene } from './motion';

interface Props {
  /** Text shown muted and never revealed (the grey first line of a two-tone heading). */
  pre?: string;
  text: string;
  as?: ElementType;
  by?: 'char' | 'word';
  className?: string;
  id?: string;
  /** Extra content after the text (not animated). */
  children?: ReactNode;
}

const WAVE = { char: 6, word: 3 };

export function Reveal({ pre, text, as: Tag = 'h2', by = 'char', className, id, children }: Props) {
  const units = useMemo(() => (by === 'char' ? Array.from(text) : text.split(/(\s+)/)), [text, by]);
  const spans = useRef<HTMLSpanElement[]>([]);
  const state = useRef<number[]>([]);
  const ref = useScene<HTMLElement>(({ p, vh }) => {
    // 'view' progress: start when the top is 90% down the screen, finish around 40%.
    const el = ref.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    const q = seg(1 - top / vh, 0.1, by === 'char' ? 0.55 : 0.75);
    void p;
    const n = spans.current.length, w = WAVE[by];
    const head = q * (n + w);
    for (let i = 0; i < n; i++) {
      const d = head - i;
      const s = d > w ? 2 : d > 0 ? 1 : 0;
      if (state.current[i] !== s) {
        state.current[i] = s;
        spans.current[i].dataset.s = String(s);
      }
    }
  }, 'view');
  spans.current = [];
  return (
    <Tag ref={ref} id={id} className={`reveal ${className || ''}`} aria-label={(pre ? pre + ' ' : '') + text}>
      {pre && <span className="reveal-pre" aria-hidden="true">{pre} </span>}
      <span aria-hidden="true">
        {units.map((u, i) => (/^\s+$/.test(u) || u === ' '
          ? <span key={i}> </span>
          : <span key={i} className="ru" data-s="0" ref={el => { if (el) spans.current.push(el); }}>{u}</span>))}
      </span>
      {children}
    </Tag>
  );
}
