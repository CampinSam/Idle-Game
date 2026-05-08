import ItemQty from '../ItemQty';

interface RewardChipProps {
  id: string;
  amount: number;
  size?: number;
  className?: string;
}

/**
 * Reward display chip. Visually similar to CostEntry but tone-tagged so
 * pages don't have to remember the variant flag. Uses the standard
 * green-tinted treatment expected on quest/mission summaries.
 */
export function RewardChip({ id, amount, size = 13, className = '' }: RewardChipProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-[rgba(34,197,94,0.35)] bg-[rgba(34,197,94,0.08)] text-[#bbf7d0] text-[12px] ${className}`.trim()}
    >
      <ItemQty src={id} amount={amount} size={size} />
    </span>
  );
}
