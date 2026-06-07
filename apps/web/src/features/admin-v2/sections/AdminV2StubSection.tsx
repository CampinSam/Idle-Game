interface StubSectionProps {
  icon: string;
  title: string;
  description: string;
  plannedFeatures: string[];
}

export default function AdminV2StubSection({ icon, title, description, plannedFeatures }: StubSectionProps) {
  return (
    <div className="flex flex-col items-center justify-center py-[60px] px-6 text-center">
      <div className="text-[48px] mb-4 opacity-40">{icon}</div>
      <h2 className="text-[22px] font-[800] text-[#e0e0ff] mb-2">{title}</h2>
      <p className="text-[14px] text-[#4a4a7a] max-w-[440px] leading-[1.6] mb-6">{description}</p>
      <ul className="list-none p-0 m-0 flex flex-col gap-2 text-left max-w-[380px]">
        {plannedFeatures.map((f, i) => (
          <li key={i} className="flex items-center gap-2 py-2 px-3 bg-[#0d0e1f] border border-[#1a1b35] rounded-[8px] text-[13px] text-[#6060a0]">
            <span style={{ color: '#6c63ff', flexShrink: 0 }}>→</span>
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}
