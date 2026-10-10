import { Card, SectionHeader } from '../../components/ui';
import { ActiveJobsList } from './ActiveJobsList';

export default function ActiveJobsPage() {
  return (
    <div className="flex-1 min-h-0 overflow-x-hidden overflow-y-auto touch-pan-y [-webkit-overflow-scrolling:touch] [overscroll-behavior:contain]">
      <div className="px-1 pt-page-top pb-6">
        <SectionHeader title="Active Jobs" className="mb-3" />
        <Card>
          <ActiveJobsList showEmpty emptyMessage="No active jobs — start a mission, craft an item, or construct a building." />
        </Card>
      </div>
    </div>
  );
}
