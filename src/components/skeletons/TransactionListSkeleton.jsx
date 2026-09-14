export default function TransactionListSkeleton({ rows = 6 }) {
  return (
    <div className="glass rounded-2xl p-5 shadow-glass animate-pulse">
      <div className="h-4 w-40 bg-white/10 rounded mb-5" />
      <div className="flex flex-col divide-y divide-white/5">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <div className="w-9 h-9 rounded-full bg-white/10 shrink-0" />
            <div className="flex-1">
              <div className="h-3 w-1/2 bg-white/10 rounded mb-2" />
              <div className="h-2.5 w-1/4 bg-white/5 rounded" />
            </div>
            <div className="h-3 w-14 bg-white/10 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
