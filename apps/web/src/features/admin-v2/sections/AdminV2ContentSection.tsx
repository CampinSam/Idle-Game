import SmartAdminEditor from '../../admin/smart/SmartAdminEditor';
import type { AdminMe } from '../../admin/adminApi';

interface Props {
  me: AdminMe;
}

export default function AdminV2ContentSection({ me: _ }: Props) {
  return (
    <div className="av2-section-full">
      <SmartAdminEditor adminKey="" />
    </div>
  );
}
