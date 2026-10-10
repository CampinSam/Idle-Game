interface DividerProps {
  className?: string;
}

export function Divider({ className = '' }: DividerProps) {
  return (
    <div
      className={`h-px bg-gradient-to-r from-transparent via-[rgba(139,92,246,0.3)] to-transparent ${className}`.trim()}
    />
  );
}
