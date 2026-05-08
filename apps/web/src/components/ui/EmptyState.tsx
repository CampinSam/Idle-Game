import { ReactNode } from 'react';

interface EmptyStateProps {
  message: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ message, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center gap-3 px-4 py-5 text-text-secondary text-sm ${className}`.trim()}>
      <span>{message}</span>
      {action}
    </div>
  );
}
