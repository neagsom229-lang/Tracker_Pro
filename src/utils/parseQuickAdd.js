import { CATEGORIES } from './constants';

/**
 * parseQuickAddText(text, corrections)
 * -------------------------------------
 * A synchronous, rule-based parser for sentences like
 * "Coffee 4.50 at Brown yesterday split with Dara". No network call,
 * no AI — this is what makes the <100ms preview budget trivially
 * achievable on this path: it's a handful of regexes over a short
 * string, which is microseconds of work, not milliseconds.
 *
 * `corrections` is a plain object of { [normalizedKeyword]: categoryId }
 * — the per-user learned patterns from the parse_corrections table
 * (see useStore.js). Checked BEFORE the static keyword map, so a user's
 * own correction always wins over the generic heuristic.
 *
 * WHAT "SPLIT WITH X" ACTUALLY DOES: this app has no bill-splitting /
 * IOU ledger feature — there's no table or UI for tracking what someone
 * else owes you. Rather than silently drop that part of the sentence,
 * or pretend to implement a whole splitting system that doesn't exist,
 * this parser folds it into the description as a plain note (e.g.
 * "Coffee (split with Dara)") so the information isn't lost, but
 * doesn't imply functionality that isn't real. If you want actual
 * split-expense tracking, that's a new feature (a new table, most
 * likely a new UI section) — worth its own pass, not folded in here.
 *
 * Returns:
 *   { description, amount, date, category, confidence, matchedKeyword }
 * `confidence` is 'high' only when BOTH an amount and a category were
 * resolved; 'low' otherwise — callers should fall back to the AI
 * endpoint (parse-transaction) on 'low', per the feature spec.
 * `matchedKeyword` is the normalized token used for category matching,
 * if any — callers use this as the pattern_key when saving a user's
 * inline correction.
 */

const CATEGORY_KEYWORDS = {
  salary: ['salary', 'paycheck', 'payroll'],
  freelance: ['freelance', 'contract payment', 'invoice paid'],
  investment: ['dividend', 'interest payment', 'stock sale'],
  food: ['coffee', 'cafe', 'restaurant', 'lunch', 'dinner', 'breakfast', 'grocery', 'groceries', 'takeout', 'food'],
  rent: ['rent', 'mortgage'],
  transport: ['uber', 'lyft', 'gas', 'fuel', 'taxi', 'parking', 'transit', 'bus fare', 'train'],
  entertainment: ['netflix', 'spotify', 'movie', 'concert', 'cinema', 'game'],
  shopping: ['amazon', 'clothes', 'shopping'],
  utilities: ['electric bill', 'water bill', 'internet bill', 'phone bill', 'utility', 'utilities'],
  health: ['pharmacy', 'doctor', 'gym', 'medicine', 'dentist'],
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function extractDate(text) {
  const lower = text.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (/\byesterday\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return { date: toISODate(d), matched: 'yesterday' };
  }
  if (/\btoday\b/.test(lower)) {
    return { date: toISODate(today), matched: 'today' };
  }
  for (let i = 0; i < WEEKDAYS.length; i++) {
    if (new RegExp(`\\b${WEEKDAYS[i]}\\b`).test(lower)) {
      // Most recent PAST (or today, if it lands exactly on today)
      // occurrence of that weekday — the natural reading of "I bought
      // this Tuesday" said on a Thursday is "this past Tuesday", not
      // next week's.
      const diff = (today.getDay() - i + 7) % 7;
      const d = new Date(today);
      d.setDate(d.getDate() - diff);
      return { date: toISODate(d), matched: WEEKDAYS[i] };
    }
  }
  return { date: toISODate(today), matched: null }; // default: today, not a failure case
}

function extractAmount(text) {
  // Prefer a $-prefixed number if one exists; otherwise take the first
  // plain number in the sentence. Either way, capture at most 2 decimals.
  const dollarMatch = text.match(/\$\s?(\d+(?:\.\d{1,2})?)/);
  if (dollarMatch) return { amount: parseFloat(dollarMatch[1]), matchedText: dollarMatch[0] };

  const plainMatch = text.match(/\b(\d+(?:\.\d{1,2})?)\b/);
  if (plainMatch) return { amount: parseFloat(plainMatch[1]), matchedText: plainMatch[0] };

  return { amount: null, matchedText: null };
}

function extractSplit(text) {
  const match = text.match(/\bsplit with (\w+)/i);
  return match ? match[1] : null;
}

function extractCategory(text, corrections) {
  const lower = text.toLowerCase();

  // A correction keyed by any word actually present in this sentence
  // wins over the static heuristic — this is the "learns per-user
  // patterns" part of the feature.
  for (const [keyword, categoryId] of Object.entries(corrections || {})) {
    if (lower.includes(keyword)) return { category: categoryId, matchedKeyword: keyword };
  }

  for (const [categoryId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword)) return { category: categoryId, matchedKeyword: keyword };
    }
  }

  return { category: null, matchedKeyword: null };
}

export function parseQuickAddText(text, corrections = {}) {
  const trimmed = text.trim();
  const { amount, matchedText: amountText } = extractAmount(trimmed);
  const { date, matched: dateKeyword } = extractDate(trimmed);
  const { category, matchedKeyword } = extractCategory(trimmed, corrections);
  const splitWith = extractSplit(trimmed);

  // Build the description by stripping out everything we already
  // extracted, so it doesn't end up saying "Coffee 4.50 at Brown
  // yesterday split with Dara" verbatim.
  let description = trimmed;
  if (amountText) description = description.replace(amountText, '');
  if (dateKeyword) description = description.replace(new RegExp(`\\b${dateKeyword}\\b`, 'i'), '');
  if (splitWith) description = description.replace(new RegExp(`split with ${splitWith}`, 'i'), '');
  description = description.replace(/\bat\s*$/i, '').replace(/\s+/g, ' ').trim();
  if (splitWith) description += ` (split with ${splitWith})`;
  if (!description) description = trimmed; // never ship an empty description

  const categoryInfo = CATEGORIES.find((c) => c.id === category);

  return {
    description,
    amount,
    date,
    category: category || 'other',
    direction: categoryInfo?.type || 'expense',
    confidence: amount !== null && category !== null ? 'high' : 'low',
    matchedKeyword, // used as parse_corrections.pattern_key if the user corrects this
  };
}