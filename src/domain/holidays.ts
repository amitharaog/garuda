/* Public holidays that stop collections (UK) or deliveries (DE / FR / NL), 2026–2027.
   National holidays only; regional ones (e.g. some German states) are not included. */

type Entry = [string, string];

const HOLIDAYS: Record<string, Entry[]> = {
  'United Kingdom': [
    ['2026-01-01', "New Year's Day"], ['2026-04-03', 'Good Friday'], ['2026-04-06', 'Easter Monday'], ['2026-05-04', 'Early May bank holiday'],
    ['2026-05-25', 'Spring bank holiday'], ['2026-08-31', 'Summer bank holiday'], ['2026-12-25', 'Christmas Day'], ['2026-12-28', 'Boxing Day (substitute)'],
    ['2027-01-01', "New Year's Day"], ['2027-03-26', 'Good Friday'], ['2027-03-29', 'Easter Monday'], ['2027-05-03', 'Early May bank holiday'],
    ['2027-05-31', 'Spring bank holiday'], ['2027-08-30', 'Summer bank holiday'], ['2027-12-27', 'Christmas Day (substitute)'], ['2027-12-28', 'Boxing Day (substitute)'],
  ],
  Germany: [
    ['2026-01-01', 'Neujahr'], ['2026-04-03', 'Karfreitag'], ['2026-04-06', 'Ostermontag'], ['2026-05-01', 'Tag der Arbeit'], ['2026-05-14', 'Christi Himmelfahrt'],
    ['2026-05-25', 'Pfingstmontag'], ['2026-10-03', 'Tag der Deutschen Einheit'], ['2026-12-25', '1. Weihnachtstag'], ['2026-12-26', '2. Weihnachtstag'],
    ['2027-01-01', 'Neujahr'], ['2027-03-26', 'Karfreitag'], ['2027-03-29', 'Ostermontag'], ['2027-05-01', 'Tag der Arbeit'], ['2027-05-06', 'Christi Himmelfahrt'],
    ['2027-05-17', 'Pfingstmontag'], ['2027-10-03', 'Tag der Deutschen Einheit'], ['2027-12-25', '1. Weihnachtstag'], ['2027-12-26', '2. Weihnachtstag'],
  ],
  France: [
    ['2026-01-01', "Jour de l'An"], ['2026-04-06', 'Lundi de Pâques'], ['2026-05-01', 'Fête du Travail'], ['2026-05-08', 'Victoire 1945'], ['2026-05-14', 'Ascension'],
    ['2026-05-25', 'Lundi de Pentecôte'], ['2026-07-14', 'Fête nationale'], ['2026-08-15', 'Assomption'], ['2026-11-01', 'Toussaint'], ['2026-11-11', 'Armistice'],
    ['2026-12-25', 'Noël'],
    ['2027-01-01', "Jour de l'An"], ['2027-03-29', 'Lundi de Pâques'], ['2027-05-01', 'Fête du Travail'], ['2027-05-06', 'Ascension'], ['2027-05-08', 'Victoire 1945'],
    ['2027-05-17', 'Lundi de Pentecôte'], ['2027-07-14', 'Fête nationale'], ['2027-08-15', 'Assomption'], ['2027-11-01', 'Toussaint'], ['2027-11-11', 'Armistice'],
    ['2027-12-25', 'Noël'],
  ],
  Netherlands: [
    ['2026-01-01', 'Nieuwjaarsdag'], ['2026-04-06', 'Tweede Paasdag'], ['2026-04-27', 'Koningsdag'], ['2026-05-14', 'Hemelvaartsdag'], ['2026-05-25', 'Tweede Pinksterdag'],
    ['2026-12-25', 'Eerste Kerstdag'], ['2026-12-26', 'Tweede Kerstdag'],
    ['2027-01-01', 'Nieuwjaarsdag'], ['2027-03-29', 'Tweede Paasdag'], ['2027-04-27', 'Koningsdag'], ['2027-05-06', 'Hemelvaartsdag'], ['2027-05-17', 'Tweede Pinksterdag'],
    ['2027-12-25', 'Eerste Kerstdag'], ['2027-12-26', 'Tweede Kerstdag'],
  ],
};

const INDEX: Record<string, Map<string, string>> = Object.fromEntries(
  Object.entries(HOLIDAYS).map(([country, list]) => [country, new Map(list)]),
);

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** The holiday's name if d is a public holiday in the country, otherwise null. */
export function holidayName(d: Date, country: string): string | null {
  return INDEX[country]?.get(iso(d)) ?? null;
}

export const HOLIDAY_YEARS = [2026, 2027];
