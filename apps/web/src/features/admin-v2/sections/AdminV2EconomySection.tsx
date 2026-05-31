import BalancePage from '../../admin/balance/BalancePage';
import type { AdminMe } from '../../admin/adminApi';

interface Props {
  me: AdminMe;
}

export default function AdminV2EconomySection({ me: _ }: Props) {
  return (
    <div className="av2-section-full">
      <BalancePage />
    </div>
  );
}
