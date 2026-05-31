import SmartAdminEditor from '../../admin/smart/SmartAdminEditor';
import type { AdminMe } from '../../admin/adminApi';

interface Props {
  me: AdminMe;
  activeGroup?: string;
}

export default function AdminV2ContentSection({ me: _, activeGroup }: Props) {
  return (
    <div className="av2-section-full">
      <SmartAdminEditor key={activeGroup || 'all'} adminKey="" initialGroup={activeGroup} />
    </div>
  );
}
