export type FeedTab = 'trending' | 'following' | 'holdings';

interface FeedTabsProps {
  activeTab: FeedTab;
  onTabChange: (tab: FeedTab) => void;
}

export function FeedTabs({ activeTab, onTabChange }: FeedTabsProps) {
  const tabClass = (tab: FeedTab) =>
    `px-4 py-2.5 text-sm transition-colors border-b-2 ${
      activeTab === tab
        ? 'border-gray-900 text-gray-900 font-medium'
        : 'border-transparent text-gray-400 hover:text-gray-600'
    }`;

  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-3xl mx-auto px-4 flex">
        <button onClick={() => onTabChange('trending')} className={tabClass('trending')}>
          Trending
        </button>
        <button onClick={() => onTabChange('following')} className={tabClass('following')}>
          Following
        </button>
        <button onClick={() => onTabChange('holdings')} className={tabClass('holdings')}>
          Holdings
        </button>
      </div>
    </div>
  );
}
