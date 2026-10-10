import SmartAdminEditor from '../../admin/smart/SmartAdminEditor';
import type { AdminMe } from '../../admin/adminApi';

interface Props {
  me: AdminMe;
  activeTable?: string;
}

export default function AdminV2ContentSection({ me: _, activeTable }: Props) {
  return (
    <div className="h-full overflow-auto">
      <SmartAdminEditor key={activeTable || 'all'} adminKey="" initialTable={activeTable} />
    </div>
  );
}
