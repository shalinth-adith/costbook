import { ShellSkeleton, Sk } from '@/components/skeleton';

/** A title, a toolbar, and the table of dishes that is the whole screen. */
export default function RecipesLoading() {
  return (
    <ShellSkeleton current="Recipes">
      <div className="sk-col">
        <Sk w="180px" h={30} r={6} />
        <Sk w="380px" h={13} />
      </div>
      <div className="sk-bar">
        <Sk w="320px" h={36} r={8} />
        <Sk w="120px" h={36} r={8} />
      </div>
      <div className="sk-table">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="sk-tr">
            <Sk w="34%" h={15} />
            <Sk w="8%" h={13} />
            <Sk w="10%" h={13} />
            <Sk w="10%" h={13} />
          </div>
        ))}
      </div>
    </ShellSkeleton>
  );
}
