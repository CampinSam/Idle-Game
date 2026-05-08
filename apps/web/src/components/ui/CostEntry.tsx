import ItemQty from '../ItemQty';

interface CostEntryProps {
  id: string;
  amount: number;
  size?: number;
  className?: string;
}

/**
 * Thin wrapper around ItemQty for cost rows. Lets pages express a cost
 * entry semantically rather than reaching into ItemQty's variant prop
 * each time. Uses the standard "icon then number" left-to-right shape.
 */
export function CostEntry({ id, amount, size = 13, className = '' }: CostEntryProps) {
  return <ItemQty src={id} amount={amount} size={size} className={className} />;
}
