import { ShellSkeleton, Sk } from '@/components/skeleton';

/**
 * A form, not a table.
 *
 * Without this, `/recipes/new` would inherit the Recipes list skeleton from
 * the segment above it and promise a table of dishes — then land on a form.
 * A skeleton that lies about what is coming is worse than none: the screen
 * jumps, and the promise it made was false.
 */
export default function NewDishLoading() {
  return (
    <ShellSkeleton current="Recipes">
      <div className="sk-col">
        <Sk w="200px" h={32} r={6} />
        <Sk w="62%" h={13} />
      </div>
      <div className="sk-bar">
        {[0, 1, 2, 3].map((i) => (
          <Sk key={i} w="210px" h={44} r={8} />
        ))}
      </div>
      <div className="sk-band">
        <div className="sk-col">
          <div className="sk-card sk-col">
            <Sk w="30%" h={16} />
            <Sk w="420px" h={40} r={8} />
            <Sk w="55%" h={12} />
          </div>
          <div className="sk-card sk-col">
            <Sk w="35%" h={16} />
            <Sk h={180} r={8} />
          </div>
        </div>
        <div className="sk-card sk-col">
          <Sk w="50%" h={16} />
          <Sk w="85%" h={13} />
          <Sk w="70%" h={13} />
        </div>
      </div>
    </ShellSkeleton>
  );
}
