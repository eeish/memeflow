import React, { useState, useEffect } from 'react';
import { Button } from './ui-simple/Button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui-simple/Dialog';
import { Alert, AlertDescription } from './ui-simple/Alert';
import { Badge } from './ui-simple/Badge';
import { UserPlus, UserMinus, Loader2, Sparkles, DollarSign } from './ui-simple/Icons';
import { useSocialFollow } from '../hooks/useSocialFollow';

interface FollowButtonProps {
  targetUserId: string;
  targetUsername: string;
  targetMarketId?: string;
  targetSupply?: number;
  size?: 'sm' | 'default' | 'lg';
  className?: string;
  showPrice?: boolean;
  onFollowChange?: (isFollowing: boolean) => void;
}

export const FollowButton: React.FC<FollowButtonProps> = ({
  targetUserId,
  targetUsername,
  targetMarketId,
  targetSupply = 0,
  size = 'default',
  className = '',
  showPrice = false,
  onFollowChange
}) => {
  const {
    loading,
    error,
    userProfile,
    followingList,
    followUser,
    unfollowUser,
    isFollowing: checkIsFollowing,
    calculatePriceMist,
    formatMistToSui
  } = useSocialFollow();

  const [isFollowing, setIsFollowing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [modalAction, setModalAction] = useState<'follow' | 'unfollow'>('follow');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    setIsFollowing(checkIsFollowing(targetUserId));
  }, [targetUserId, checkIsFollowing, followingList]);

  const hasFreeSponsor = userProfile?.sponsorLeft && userProfile.sponsorLeft > 0;
  const followPrice = calculatePriceMist(targetSupply + 1);
  const unfollowRefund = calculatePriceMist(targetSupply);
  const isFreeFollow = hasFreeSponsor && !isFollowing;

  const handleFollowClick = () => {
    if (!userProfile) {
      // User needs to create profile first
      alert('Please create your social profile first');
      return;
    }

    if (!targetMarketId) {
      alert('This user has not set up their social profile yet');
      return;
    }

    if (isFollowing) {
      setModalAction('unfollow');
    } else {
      setModalAction('follow');
    }

    // Show confirmation modal if it's a paid action
    if (!isFreeFollow || isFollowing) {
      setShowConfirmModal(true);
    } else {
      // Direct follow for free sponsored follows
      handleConfirmedAction();
    }
  };

  const handleConfirmedAction = async () => {
    setProcessing(true);
    setShowConfirmModal(false);

    try {
      if (modalAction === 'follow' && targetMarketId) {
        await followUser(targetMarketId, targetUserId, targetSupply);
        setIsFollowing(true);
        onFollowChange?.(true);
      } else if (modalAction === 'unfollow' && targetMarketId) {
        await unfollowUser(targetMarketId, targetUserId);
        setIsFollowing(false);
        onFollowChange?.(false);
      }
    } catch (err) {
      console.error('Follow action failed:', err);
    } finally {
      setProcessing(false);
    }
  };

  const getButtonSize = () => {
    switch (size) {
      case 'sm': return 'h-8 px-3 text-sm';
      case 'lg': return 'h-12 px-6 text-lg';
      default: return 'h-10 px-4';
    }
  };

  const buttonClasses = `${getButtonSize()} ${className}`;

  return (
    <>
      <Button
        onClick={handleFollowClick}
        disabled={loading || processing || !targetMarketId}
        variant={isFollowing ? 'outline' : 'default'}
        className={buttonClasses}
      >
        {processing || loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : isFollowing ? (
          <>
            <UserMinus className="w-4 h-4 mr-2" />
            Following
          </>
        ) : (
          <>
            <UserPlus className="w-4 h-4 mr-2" />
            {isFreeFollow && <Sparkles className="w-3 h-3 mr-1 text-yellow-400" />}
            Follow
            {showPrice && !isFreeFollow && (
              <span className="ml-2 text-xs opacity-80">
                {formatMistToSui(followPrice)} SUI
              </span>
            )}
          </>
        )}
      </Button>

      <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle className="text-gray-900">
              {modalAction === 'follow' ? 'Follow User' : 'Unfollow User'}
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              {modalAction === 'follow' 
                ? `Confirm following @${targetUsername}`
                : `Confirm unfollowing @${targetUsername}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* User Info */}
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <p className="font-semibold text-gray-900">@{targetUsername}</p>
                <p className="text-sm text-gray-600">
                  {targetSupply} followers
                </p>
              </div>
              {modalAction === 'follow' && hasFreeSponsor && (
                <Badge className="bg-gradient-to-r from-yellow-400 to-orange-400 text-white">
                  <Sparkles className="w-3 h-3 mr-1" />
                  Free Sponsor
                </Badge>
              )}
            </div>

            {/* Price Info */}
            <div className="space-y-2">
              {modalAction === 'follow' ? (
                <>
                  {!isFreeFollow && (
                    <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                      <span className="text-gray-700">Follow Price:</span>
                      <span className="font-bold text-blue-600">
                        <DollarSign className="w-4 h-4 inline mr-1" />
                        {formatMistToSui(followPrice)} SUI
                      </span>
                    </div>
                  )}
                  {hasFreeSponsor && (
                    <Alert className="border-yellow-200 bg-yellow-50">
                      <Sparkles className="w-4 h-4 text-yellow-600" />
                      <AlertDescription className="text-yellow-800">
                        You have {userProfile.sponsorLeft} free follows remaining!
                      </AlertDescription>
                    </Alert>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <span className="text-gray-700">Refund Amount:</span>
                  <span className="font-bold text-green-600">
                    <DollarSign className="w-4 h-4 inline mr-1" />
                    {formatMistToSui(unfollowRefund)} SUI
                  </span>
                </div>
              )}
            </div>

            {/* Economic Model Explanation */}
            <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded">
              <p className="font-semibold mb-1">📈 Bonding Curve Pricing</p>
              <p>
                {modalAction === 'follow' 
                  ? "Price increases with each new follower. Early followers pay less!"
                  : "You'll receive a refund based on the current follower count."}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowConfirmModal(false)}
              className="border-gray-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmedAction}
              disabled={processing}
              className={modalAction === 'follow' 
                ? "bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white"
                : "bg-red-500 hover:bg-red-600 text-white"
              }
            >
              {processing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : modalAction === 'follow' ? (
                <>
                  <UserPlus className="w-4 h-4 mr-2" />
                  {isFreeFollow ? 'Follow for Free' : `Follow (${formatMistToSui(followPrice)} SUI)`}
                </>
              ) : (
                <>
                  <UserMinus className="w-4 h-4 mr-2" />
                  Unfollow (+{formatMistToSui(unfollowRefund)} SUI)
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {error && (
        <Alert className="mt-2 border-red-200 bg-red-50">
          <AlertDescription className="text-red-700">{error}</AlertDescription>
        </Alert>
      )}
    </>
  );
};
