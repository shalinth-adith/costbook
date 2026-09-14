import { ShellSkeleton, Sk } from '@/components/skeleton';

/** One card a dish, down the page, ready for the printer. */
export default function CardsLoading() {
  return (
    <ShellSkeleton current="Recipes">
      <div className="sk-col">
        <Sk w="230px" h={30} r={6} />
        <Sk w="50%" h={13} />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="sk-card sk-col">
          <Sk w="40%" h={22} />
          <Sk w="25%" h={12} />
          <div className="sk-table">
            {Array.from({ length: 5 }, (_, j) => (
              <div key={j} className="sk-tr">
                <Sk w="40%" h={13} />
                <Sk w="10%" h={13} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </ShellSkeleton>
  );
}
