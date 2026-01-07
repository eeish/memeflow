import { TrendingUp, Users } from 'lucide-react';

interface FeedTabsProps {
  activeTab: 'trending' | 'following';
  onTabChange: (tab: 'trending' | 'following') => void;
}

export function FeedTabs({ activeTab, onTabChange }: FeedTabsProps) {
  return (
    <div className="bg-white border-b border-gray-200">
      <div className="max-w-3xl mx-auto px-4 flex">
        <button
          onClick={() => onTabChange('trending')}
          className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors border-b-2 ${
            activeTab === 'trending'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          Trending
        </button>

        <button
          onClick={() => onTabChange('following')}
          className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors border-b-2 ${
            activeTab === 'following'
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="h-4 w-4" />
          Following
        </button>
      </div>
    </div>
  );
}
