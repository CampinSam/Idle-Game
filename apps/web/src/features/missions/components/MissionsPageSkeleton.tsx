export function MissionsPageSkeleton() {
  return (
    <div className="flex flex-col flex-1 min-h-0 p-3.5 gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="skeleton w-full h-[110px] rounded-xl" />
      ))}
    </div>
  );
}
