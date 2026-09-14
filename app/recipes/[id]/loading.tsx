import { ShellSkeleton, Sk } from '@/components/skeleton';

/** A cost sheet: five figures across the top, the lines below, the working beside. */
export default function DishLoading() {
  return (
    <ShellSkeleton current="Recipes">
      <Sk w="220px" h={12} />
      <div className="sk-col">
        <Sk w="260px" h={34} r={6} />
        <Sk w="90px" h={13} />
      </div>
      <div className="sk-cards sk-cards-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="sk-card sk-col">
            <Sk w="70%" h={11} />
            <Sk w="85%" h={28} r={6} />
            <Sk w="55%" h={11} />
          </div>
        ))}
      </div>
      <div className="sk-band">
        <div className="sk-table">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="sk-tr">
              <Sk w="38%" h={14} />
              <Sk w="12%" h={13} />
              <Sk w="14%" h={13} />
            </div>
          ))}
        </div>
        <div className="sk-card sk-col">
          <Sk w="70%" h={11} />
          <Sk h={10} r={5} />
          <Sk w="90%" h={13} />
          <Sk w="80%" h={13} />
          <Sk w="60%" h={13} />
        </div>
      </div>
    </ShellSkeleton>
  );
}
