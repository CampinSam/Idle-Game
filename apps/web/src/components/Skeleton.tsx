interface SkeletonProps {
  width?: string;
  height?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = '1em', className = '', style }: SkeletonProps) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ display: 'block', width, height, ...style }}
      aria-hidden="true"
    />
  );
}

export function HomePageSkeleton() {
  return (
    <div
      className="flex flex-col flex-1 min-h-0 overflow-x-hidden overflow-y-auto p-3.5"
      aria-busy="true"
      aria-label="Loading..."
    >
      <div className="mb-4">
        <div
          className="rounded-xl min-h-[100px] bg-bg-card"
        >
          <Skeleton height="100px" />
        </div>
      </div>

      <div className="bg-gradient-to-br from-[#1a1640] to-[#221a50] border border-[rgba(139,92,246,0.25)] rounded-[14px] overflow-hidden mb-4">
        <div className="p-4">
          <Skeleton width="140px" height="14px" />
          <div className="mt-3 flex gap-3">
            <Skeleton width="64px" height="64px" style={{ borderRadius: 8 }} />
            <div className="flex-1 flex flex-col gap-2">
              <Skeleton height="14px" />
              <Skeleton height="14px" width="70%" />
            </div>
          </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-[rgba(139,92,246,0.3)] to-transparent" />

        <div className="px-4 py-3 flex flex-col gap-3">
          <Skeleton width="100px" height="14px" />
          <Skeleton height="48px" />
          <Skeleton height="48px" />
        </div>
      </div>

      <div className="mb-4">
        <div className="bg-gradient-to-br from-[#1a1640] to-[#221a50] border border-[rgba(139,92,246,0.25)] rounded-[14px] p-4 flex flex-col gap-3">
          <Skeleton width="120px" height="14px" />
          <div className="flex gap-3 items-center">
            <Skeleton width="60px" height="60px" />
            <div className="flex-1 flex flex-col gap-2">
              <Skeleton height="12px" width="80%" />
              <Skeleton height="8px" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
