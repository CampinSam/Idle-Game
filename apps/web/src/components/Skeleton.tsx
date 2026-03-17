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
    <div className="hp" aria-busy="true" aria-label="Loading...">
      <div className="hp-section">
        <div className="hp-season-banner" style={{ background: 'var(--bg-card)', borderRadius: 12, minHeight: 100 }}>
          <Skeleton height="100px" />
        </div>
      </div>

      <div className="hp-combined-card">
        <div className="hp-combined-top" style={{ padding: '16px' }}>
          <Skeleton width="140px" height="14px" />
          <div style={{ margin: '12px 0', display: 'flex', gap: 12 }}>
            <Skeleton width="64px" height="64px" className="skeleton" style={{ borderRadius: 8 } as React.CSSProperties} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton height="14px" />
              <Skeleton height="14px" width="70%" />
            </div>
          </div>
        </div>

        <div className="hp-combined-divider" />

        <div className="hp-combined-bottom" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Skeleton width="100px" height="14px" />
          <Skeleton height="48px" />
          <Skeleton height="48px" />
        </div>
      </div>

      <div className="hp-section">
        <div className="hp-keeper-card" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16 }}>
          <Skeleton width="120px" height="14px" />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Skeleton width="60px" height="60px" />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Skeleton height="12px" width="80%" />
              <Skeleton height="8px" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
