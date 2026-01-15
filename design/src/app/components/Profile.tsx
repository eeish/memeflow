import { useState } from 'react';
import { ArrowLeft, Users, User, TrendingUp, LogOut } from 'lucide-react';
import { Button } from './ui/button';
import { SimpleChart } from './SimpleChart';

interface ProfileProps {
  walletAddress: string;
  fullAddress: string;
  chain: 'sui' | 'ethereum';
  onClose: () => void;
  onLogout: () => void;
}

// Generate mock chart data
const generateChartData = () => {
  const data = [];
  const startDate = new Date('2024-01-01');
  let baseValue = 0.0008;
  
  for (let i = 0; i < 90; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    
    // Random walk with slight upward trend
    const change = (Math.random() - 0.45) * 0.0001;
    baseValue = Math.max(0.0001, baseValue + change);
    
    data.push({
      time: date.toISOString().split('T')[0],
      value: baseValue,
    });
  }
  
  return data;
};

const chartData = generateChartData();
const currentPrice = chartData[chartData.length - 1].value;
const previousPrice = chartData[chartData.length - 2].value;
const priceChange = ((currentPrice - previousPrice) / previousPrice) * 100;

export function Profile({ walletAddress, fullAddress, chain, onClose, onLogout }: ProfileProps) {
  const [activeTab, setActiveTab] = useState<'posts' | 'holders'>('posts');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Back to Feed"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-lg tracking-tight text-gray-900">Profile</h1>
          <button
            onClick={onLogout}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Logout"
          >
            <LogOut className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Profile Info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 mb-4">
          <div className="flex items-center gap-4 mb-6">
            <div className={`w-20 h-20 rounded-full bg-gradient-to-br ${
              chain === 'ethereum' 
                ? 'from-blue-400 to-purple-500' 
                : 'from-cyan-400 to-blue-500'
            }`} />
            <div className="flex-1 min-w-0">
              <h2 className="font-mono text-sm text-gray-900 mb-1 truncate">{fullAddress}</h2>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  1.2k followers
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  340 following
                </span>
              </div>
              <div className="mt-2">
                <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                  {chain === 'ethereum' ? 'Ethereum' : 'Sui'}
                </span>
              </div>
            </div>
          </div>

          <Button className="w-full bg-gray-900 hover:bg-gray-800">
            Edit Profile
          </Button>
        </div>

        {/* Price Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 mb-4">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-gray-600">Share Price</h3>
              <div className="text-xs text-gray-500">24h</div>
            </div>
            
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-3xl font-mono text-gray-900">
                {currentPrice.toFixed(4)}
              </span>
              <span className="text-sm text-gray-600">ETH</span>
            </div>
            
            <div className={`flex items-center gap-1 text-sm ${priceChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              <TrendingUp className="h-4 w-4" />
              {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <SimpleChart data={chartData} />
          </div>

          <div className="border-t border-gray-100 mt-4 pt-4">
            <div className="text-xs text-gray-500 mb-3">Market Info</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500 mb-1">24h Volume</div>
                <div className="text-sm font-mono text-gray-900">2.4 ETH</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Holders</div>
                <div className="text-sm font-mono text-gray-900">1,234</div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Card */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
          <h3 className="text-sm text-gray-600 mb-4">Activity</h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-mono text-gray-900 mb-1">127</div>
              <div className="text-xs text-gray-500">Posts</div>
            </div>
            <div>
              <div className="text-2xl font-mono text-gray-900 mb-1">892</div>
              <div className="text-xs text-gray-500">Likes</div>
            </div>
            <div>
              <div className="text-2xl font-mono text-gray-900 mb-1">43</div>
              <div className="text-xs text-gray-500">Comments</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}