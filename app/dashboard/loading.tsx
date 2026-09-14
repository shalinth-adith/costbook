import { ShellSkeleton, Sk } from '@/components/skeleton';

/** The dashboard's own shape: the headline figure, the actions, the doors. */
export default function DashboardLoading() {
  return (
    <ShellSkeleton current="Dashboard">
      <div className="sk-head">
        <Sk w="240px" h={56} r={8} />
        <span className="sk-ring" aria-hidden="true" />
        <div className="sk-col">
          <Sk w="70%" h={18} />
          <Sk w="45%" h={13} />
        </div>
      </div>

      <Sk w="180px" h={22} />
      <div className="sk-rows">
        {[0, 1, 2].map((i) => (
          <div key={i} className="sk-row">
            <Sk w={`${String(70 - i * 8)}%`} h={14} />
          </div>
        ))}
      </div>

      <div className="sk-cards sk-cards-2">
        {[0, 1].map((i) => (
          <div key={i} className="sk-card sk-col">
            <Sk w="40%" h={11} />
            <Sk w="75%" h={15} />
          </div>
        ))}
      </div>

      <div className="sk-cards sk-cards-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="sk-card sk-col">
            <Sk w="46px" h={34} r={6} />
            <Sk w="80%" h={13} />
            <Sk h={6} r={3} />
          </div>
        ))}
      </div>
    </ShellSkeleton>
  );
}
