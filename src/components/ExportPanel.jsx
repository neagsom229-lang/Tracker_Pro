import { Download, FileText } from 'lucide-react';
import { useStore } from '../store/useStore';
import { CURRENCIES } from '../utils/constants';
import { downloadCSV } from '../utils/format';

// Transaction `description` (and, in principle, `category`) is free text
// the user typed into TransactionModal — it is intentionally NOT
// sanitized there, since it's just a string in the database at that
// point. It only becomes dangerous here, where it gets concatenated into
// an HTML string and handed to `document.write`. Escaping the five HTML
// metacharacters at the point of injection (rather than at input time)
// is the correct place to fix this: a description like
// `<img src=x onerror=alert(document.cookie)>` must render as inert
// text in the report, not execute as markup.
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char]));

export default function ExportPanel() {
  const transactions = useStore((s) => s.transactions);
  const currency = useStore((s) => s.profile?.currency || "USD");
  const setCurrency = useStore((s) => s.setCurrency);

  const handlePDF = () => {
    // A lightweight "print to PDF" flow — opens the browser print dialog
    // pre-filled with a clean transaction report. No extra dependency
    // needed; the user just chooses "Save as PDF" as the destination.
    const rows = transactions
      .map(
        (t) =>
          `<tr><td>${escapeHtml(t.date)}</td><td>${escapeHtml(t.description)}</td><td>${escapeHtml(t.category)}</td><td style="color:${
            t.amount >= 0 ? '#059669' : '#DC2626'
          }">${t.amount >= 0 ? '+' : '-'}$${escapeHtml(Math.abs(t.amount).toFixed(2))}</td></tr>`
      )
      .join('');
    const html = `<html><head><title>Obsidian — Transaction Report</title>
      <style>body{font-family:Inter,sans-serif;padding:32px;} table{width:100%;border-collapse:collapse;} td,th{padding:8px;border-bottom:1px solid #eee;text-align:left;font-size:13px;}</style>
      </head><body><h2>Transaction Report</h2><table><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr>${rows}</table></body></html>`;
    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    win.print();
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="glass rounded-2xl p-5 shadow-glass">
        <h3 className="text-slate-100 font-medium mb-1">Export Your Data</h3>
        <p className="text-sm text-slate-500 mb-4">Download everything for your records or your accountant.</p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => downloadCSV(transactions)}
            className="gilt-btn rounded-xl px-4 py-2.5 text-sm flex items-center gap-2"
          >
            <Download size={15} /> Download CSV
          </button>
          <button
            onClick={handlePDF}
            className="rounded-xl px-4 py-2.5 text-sm flex items-center gap-2 border border-white/10 text-slate-200 hover:bg-white/5"
          >
            <FileText size={15} /> Export PDF Report
          </button>
        </div>
      </div>

      <div className="glass rounded-2xl p-5 shadow-glass">
        <h3 className="text-slate-100 font-medium mb-1">Base Currency</h3>
        <p className="text-sm text-slate-500 mb-4">All amounts are stored in USD and converted for display.</p>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="bg-obsidian-800/60 border border-white/8 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label} ({c.symbol})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}