/* Code 128 (set B) barcodes as inline SVG, for carton and pallet labels. */

// Bar/space widths for symbol values 0–106 (106 = stop, 7 elements).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
export const CODE128_PATTERNS: readonly string[] = PATTERNS;
const START_B = 104, STOP = 106;

/** Symbol values for text in set B (printable ASCII 32–126), with start code and checksum. */
export function code128Values(text: string): number[] {
  const data = [...text].map(ch => {
    const c = ch.charCodeAt(0);
    if (c < 32 || c > 126) throw new Error(`Character not supported in a Code 128 B barcode: ${JSON.stringify(ch)}`);
    return c - 32;
  });
  const checksum = data.reduce((s, v, i) => s + v * (i + 1), START_B) % 103;
  return [START_B, ...data, checksum, STOP];
}

/** An SVG barcode; module = width of the thinnest bar in px. */
export function code128Svg(text: string, opts: { height?: number; module?: number; color?: string } = {}): string {
  const { height = 48, module = 1.6, color = '#000' } = opts;
  const quiet = 10;
  let x = quiet, rects = '';
  for (const v of code128Values(text)) {
    const p = PATTERNS[v];
    for (let i = 0; i < p.length; i++) {
      const w = +p[i] * module;
      if (i % 2 === 0) rects += `<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}"/>`;
      x += w;
    }
  }
  const width = x + quiet;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(2)} ${height}" width="${width.toFixed(0)}" height="${height}" role="img" aria-label="Barcode ${text.replace(/"/g, '')}"><g fill="${color}">${rects}</g></svg>`;
}
