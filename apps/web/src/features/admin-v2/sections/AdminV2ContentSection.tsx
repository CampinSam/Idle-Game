import SmartAdminEditor from '../../admin/smart/SmartAdminEditor';
import type { AdminMe } from '../../admin/adminApi';

interface Props {
  me: AdminMe;
  activeGroup?: string;
}

export default function AdminV2ContentSection({ me: _, activeGroup }: Props) {
  return (
    <div className="h-full overflow-auto">
      <SmartAdminEditor key={activeGroup || 'all'} adminKey="" initialGroup={activeGroup} />
    </div>
  );
}
