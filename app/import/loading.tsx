import { ShellSkeleton, Sk } from '@/components/skeleton';

/** Three steps and the target a file is dropped on. */
export default function ImportLoading() {
  return (
    <ShellSkeleton current="Import">
      <div className="sk-col">
        <Sk w="240px" h={30} r={6} />
        <Sk w="55%" h={13} />
      </div>
      <div className="sk-bar">
        {[0, 1, 2].map((i) => (
          <Sk key={i} w="150px" h={38} r={8} />
        ))}
      </div>
      <div className="sk-band">
        <Sk h={260} r={12} />
        <div className="sk-col">
          {[0, 1, 2].map((i) => (
            <div key={i} className="sk-card sk-col">
              <Sk w="55%" h={15} />
              <Sk w="90%" h={13} />
            </div>
          ))}
        </div>
      </div>
    </ShellSkeleton>
  );
}
