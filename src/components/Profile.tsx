import React, { useMemo } from 'react';
import { Button } from './ui-simple/Button';
import { TrendingUp, Users, User, ArrowLeft } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { useSocialFollow, calculatePriceMist } from '../hooks/useSocialFollow';
import { SimpleChart } from './SimpleChart';
import { useNetwork } from '../contexts/NetworkContext';

const MIST_PER_SUI = 1_000_000_000;

interface ProfileProps {
  user: any;
  onClose: () => void;
}

// Generate mock chart data
const generateChartData = (basePrice: number, followerCount: number) => {
  const data = [];
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 90);
  let currentValue = basePrice;

  for (let i = 0; i < 90; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);

    // Random walk with slight upward trend
    const change = (Math.random() - 0.45) * 0.0001;
    currentValue = Math.max(0.0001, currentValue + change);

    data.push({
      time: date.toISOString().split('T')[0],
      value: currentValue,
    });
  }

  return data;
};

export function Profile({ user, onClose }: ProfileProps) {
  const { signOut } = useAuth();
  const { userProfile, followingList } = useSocialFollow();
  const { currentNetwork } = useNetwork();

  const sharePriceSui = useMemo(() => {
    if (userProfile?.currentPrice) {
      return Number(userProfile.currentPrice) / MIST_PER_SUI;
    }
    if (typeof userProfile?.followerCount === 'number') {
      return Number(calculatePriceMist(userProfile.followerCount)) / MIST_PER_SUI;
    }
    return 0.001;
  }, [userProfile?.currentPrice, userProfile?.followerCount]);

  const chartData = useMemo(
    () => generateChartData(sharePriceSui, userProfile?.followerCount || 0),
    [sharePriceSui, userProfile?.followerCount]
  );

  const currentPrice = chartData[chartData.length - 1]?.value || sharePriceSui;
  const previousPrice = chartData[chartData.length - 2]?.value || sharePriceSui;
  const priceChange = previousPrice ? ((currentPrice - previousPrice) / previousPrice) * 100 : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Back to feed"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <h1 className="text-lg tracking-tight text-gray-900">Profile</h1>
          <div className="w-9" /> {/* Spacer for centering */}
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-6">
        {/* Profile Info */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 mb-4">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-300 to-gray-400" />
            <div>
              <h2 className="font-mono text-xl text-gray-900 mb-1">
                @{user.username}
              </h2>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {userProfile?.followerCount || 0} followers
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-4 w-4" />
                  {userProfile?.followingCount || followingList.length || 0} following
                </span>
              </div>
            </div>
          </div>

          <Button
            onClick={signOut}
            variant="outline"
            className="w-full border-gray-300"
          >
            Sign Out
          </Button>
        </div>

        {/* Price Card */}
        {userProfile && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6 mb-4">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm text-gray-600">Share Price</h3>
                <div className="text-xs text-gray-500">90d</div>
              </div>

              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-3xl font-mono text-gray-900">
                  {currentPrice.toFixed(4)}
                </span>
                <span className="text-sm text-gray-600">SUI</span>
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
                  <div className="text-xs text-gray-500 mb-1">Current Price</div>
                  <div className="text-sm font-mono text-gray-900">
                    {userProfile.currentPrice
                      ? `${(Number(userProfile.currentPrice) / 1e9).toFixed(6)} SUI`
                      : '0.000000 SUI'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Next Price</div>
                  <div className="text-sm font-mono text-gray-900">
                    {userProfile.nextPrice
                      ? `${(Number(userProfile.nextPrice) / 1e9).toFixed(6)} SUI`
                      : '0.000000 SUI'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Card */}
        {userProfile && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-6">
            <h3 className="text-sm text-gray-600 mb-4">Activity</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="text-2xl font-mono text-gray-900 mb-1">
                  {userProfile.followerCount || 0}
                </div>
                <div className="text-xs text-gray-500">Followers</div>
              </div>
              <div>
                <div className="text-2xl font-mono text-gray-900 mb-1">
                  {userProfile.followingCount || followingList.length || 0}
                </div>
                <div className="text-xs text-gray-500">Following</div>
              </div>
              <div>
                <div className="text-2xl font-mono text-gray-900 mb-1">
                  {userProfile.sponsorLeft || 0}
                </div>
                <div className="text-xs text-gray-500">Free Follows</div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
