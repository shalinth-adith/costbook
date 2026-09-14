import { ShellSkeleton, Sk } from '@/components/skeleton';

/** Settings is a list of sections beside the fields they hold. */
export default function SettingsLoading() {
  return (
    <ShellSkeleton current="Settings">
      <div className="sk-col">
        <Sk w="160px" h={30} r={6} />
        <Sk w="48%" h={13} />
      </div>
      <div className="sk-band">
        <div className="sk-col">
          {Array.from({ length: 5 }, (_, i) => (
            <Sk key={i} h={40} r={8} />
          ))}
        </div>
        <div className="sk-card sk-col">
          <Sk w="45%" h={15} />
          <Sk h={36} r={8} />
          <Sk w="85%" h={13} />
          <Sk h={36} r={8} />
          <Sk w="70%" h={13} />
        </div>
      </div>
    </ShellSkeleton>
  );
}
