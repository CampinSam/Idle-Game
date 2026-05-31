interface StubSectionProps {
  icon: string;
  title: string;
  description: string;
  plannedFeatures: string[];
}

export default function AdminV2StubSection({ icon, title, description, plannedFeatures }: StubSectionProps) {
  return (
    <div className="av2-stub-wrap">
      <div className="av2-stub-icon">{icon}</div>
      <h2 className="av2-stub-title">{title}</h2>
      <p className="av2-stub-desc">{description}</p>
      <ul className="av2-stub-features">
        {plannedFeatures.map((f, i) => (
          <li key={i} className="av2-stub-feature">
            <span style={{ color: '#6c63ff', flexShrink: 0 }}>→</span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
