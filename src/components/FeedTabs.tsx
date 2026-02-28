import { TrendingUp, Users, Briefcase } from './ui-simple/Icons';

export type FeedTab = 'trending' | 'following' | 'holdings';

interface FeedTabsProps {
  activeTab: FeedTab;
  onTabChange: (tab: FeedTab) => void;
}

export function FeedTabs({ activeTab, onTabChange }: FeedTabsProps) {
  const tabClass = (tab: FeedTab) =>
    `flex items-center gap-2 px-4 py-3 text-sm transition-colors border-b-2 ${
      activeTab === tab
        ? 'border-gray-900 text-gray-900'
        : 'border-transparent text-gray-500 hover:text-gray-700'
    }`;

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-3xl mx-auto px-4 flex">
        <button onClick={() => onTabChange('trending')} className={tabClass('trending')}>
          <TrendingUp className="h-4 w-4" />
          Trending
        </button>

        <button onClick={() => onTabChange('following')} className={tabClass('following')}>
          <Users className="h-4 w-4" />
          Following
        </button>

        <button onClick={() => onTabChange('holdings')} className={tabClass('holdings')}>
          <Briefcase className="h-4 w-4" />
          Holdings
        </button>
      </div>
    </div>
  );
}
