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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 glass rounded-2xl p-5 h-72 flex items-center justify-center">
          <div className="w-36 h-36 rounded-full border-8 border-white/10" />
        </div>
        <div className="lg:col-span-3 glass rounded-2xl p-5">
          <div className="h-4 w-32 bg-white/10 rounded mb-5" />
          <div className="flex flex-col divide-y divide-white/5">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 py-3">
                <div className="w-9 h-9 rounded-full bg-white/10 shrink-0" />
                <div className="flex-1">
                  <div className="h-3 w-2/3 bg-white/10 rounded mb-2" />
                  <div className="h-2.5 w-1/3 bg-white/5 rounded" />
                </div>
                <div className="h-3 w-14 bg-white/10 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
