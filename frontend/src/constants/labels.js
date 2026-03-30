// Státusz fordítások (belső érték → megjelenített szöveg)
export const STATUS_LABELS = {
  NEW: 'Várakozó',
  AI_ANSWERED: 'AI kezelte',
  NEEDS_ATTENTION: 'Emberi döntés szükséges',
  CLOSED: 'Lezárva',
}

// Szűrő feliratok (null = összes)
export const FILTER_LABELS = {
  null: 'Összes',
  NEW: 'Várakozó',
  AI_ANSWERED: 'AI kezelte',
  NEEDS_ATTENTION: 'Figyelmet igényel',
  CLOSED: 'Lezárva',
}

// Kategória fordítások
export const CATEGORY_LABELS = {
  complaint: 'Panasz',
  inquiry: 'Érdeklődés',
  invoice: 'Számla',
  other: 'Egyéb',
}

// Hangulat fordítások
export const SENTIMENT_LABELS = {
  positive: 'Pozitív',
  neutral: 'Semleges',
  negative: 'Negatív',
  angry: 'Dühös',
}
