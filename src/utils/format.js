import { getCurrency } from './constants';

// Converts a USD-denominated amount into the user's chosen display currency
// and formats it with the right symbol. All amounts are stored in USD
// internally so switching currency is just a display-layer conversion.
export function formatMoney(amountUSD, currencyCode = 'USD') {
  const currency = getCurrency(currencyCode);
  const converted = amountUSD * currency.rate;
  const decimals = currency.code === 'KHR' || currency.code === 'JPY' ? 0 : 2;
  const formatted = converted.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${currency.symbol}${formatted}`;
}

export function formatDate(isoDate) {
  const d = new Date(isoDate);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Wraps a single value in quotes and escapes any quote characters inside
// it, per RFC 4180. Applied to every field (not just description) so the
// CSV stays valid even if `category`/`type` ever contain a comma or
// quote — today they're from a fixed constants list with neither, but
// quoting every field is free insurance against that changing later.
const csvField = (value) => `"${String(value).replace(/"/g, '""')}"`;

export function toCSV(transactions) {
  const header = ['Date', 'Description', 'Category', 'Type', 'Amount (USD)'];
  const rows = transactions.map((t) => [
    t.date,
    t.description,
    t.category,
    t.amount >= 0 ? 'Income' : 'Expense',
    t.amount.toFixed(2),
  ].map(csvField));
  return [header.map(csvField), ...rows].map((r) => r.join(',')).join('\n');
}

export function downloadCSV(transactions, filename = 'transactions.csv') {
  const csv = toCSV(transactions);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}