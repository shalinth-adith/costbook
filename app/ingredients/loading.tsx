import { ShellSkeleton, Sk } from '@/components/skeleton';

/** The entry row sits at the top here, above the list — so does its outline. */
export default function IngredientsLoading() {
  return (
    <ShellSkeleton current="Ingredients">
      <div className="sk-col">
        <Sk w="220px" h={30} r={6} />
        <Sk w="60%" h={13} />
      </div>
      <div className="sk-card sk-col">
        <Sk w="120px" h={11} />
        <div className="sk-bar">
          <Sk w="42%" h={36} r={8} />
          <Sk w="90px" h={36} r={8} />
          <Sk w="110px" h={36} r={8} />
          <Sk w="70px" h={36} r={8} />
        </div>
      </div>
      <div className="sk-table">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="sk-tr">
            <Sk w="30%" h={15} />
            <Sk w="12%" h={13} />
            <Sk w="8%" h={13} />
            <Sk w="12%" h={13} />
          </div>
        ))}
      </div>
    </ShellSkeleton>
  );
}
