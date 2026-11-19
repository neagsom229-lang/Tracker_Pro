import TransactionListSkeleton from './TransactionListSkeleton';

// Skeletons intentionally mirror the real layout's shape (same card sizes,
// same grid) so there's no layout shift once real data arrives.
export default function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass rounded-2xl p-5 h-[104px] flex flex-col justify-between">
            <div className="h-3 w-20 bg-white/10 rounded" />
            <div className="h-7 w-28 bg-white/10 rounded" />
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl p-5 h-16" />

      <div className="glass rounded-2xl p-5 h-72">
        <div className="h-4 w-32 bg-white/10 rounded mb-5" />
        <div className="flex items-center justify-center">
          <div className="w-36 h-36 rounded-full border-8 border-white/10" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 glass rounded-2xl p-5 h-72 flex items-center justify-center">
          <div className="w-36 h-36 rounded-full border-8 border-white/10" />
        </div>
        <div className="lg:col-span-3">
          <TransactionListSkeleton />
        </div>
      </div>
    </div>
  );
}
