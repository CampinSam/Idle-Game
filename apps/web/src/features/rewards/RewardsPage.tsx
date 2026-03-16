import DailyRewardContainer from '../checkin/DailyRewardContainer';
import QuestList from '../quests/QuestList';
import './RewardsPage.css';

export default function RewardsPage() {
  return (
    <div className="rewards-page">
      <DailyRewardContainer />
      <div className="rewards-divider" />
      <QuestList />
    </div>
  );
}
