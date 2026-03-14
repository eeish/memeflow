import React, { useMemo, useEffect, useState } from 'react';
import { Button } from './ui-simple/Button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui-simple/Dialog';
import { Alert, AlertDescription } from './ui-simple/Alert';
import { ShoppingCart, Loader2, TrendingUp, AlertTriangle, Info, CheckCircle, ExternalLink } from './ui-simple/Icons';
import { calculatePriceMist, formatMistToSui } from '../hooks/useSocialFollow';
import type { GraduationState } from '../lib/graduation';
import { MAX_SUPPLY } from '../lib/graduation';
import { getTxUrl } from '../lib/config';

interface BuyShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetUsername: string;
  targetAvatarUrl?: string | null;
  currentHolders: number;
  onConfirm: () => Promise<void>;
  isPurchasing: boolean;
  error?: string | null;
  graduationState?: GraduationState;
  purchaseSuccess?: boolean;
  txDigest?: string;
}

export const BuyShareDialog: React.FC<BuyShareDialogProps> = ({
  open,
  onOpenChange,
  targetUsername,
  targetAvatarUrl,
  currentHolders,
  onConfirm,
  isPurchasing,
  error,
  graduationState,
  purchaseSuccess,
  txDigest,
}) => {
  const isGraduated = graduationState?.phase === 'graduated';
  const isAwaitingGraduation = graduationState?.phase === 'graduating';

  // Capture the price when purchase begins so we can show it in the success view
  const [paidPrice, setPaidPrice] = useState<string | null>(null);

  // Calculate buy price (price for the next holder position)
  const buyPrice = useMemo(() => {
    const nextHolder = currentHolders + 1;
    if (nextHolder > MAX_SUPPLY) return null;
    return calculatePriceMist(nextHolder);
  }, [currentHolders]);

  const buyPriceFormatted = buyPrice ? formatMistToSui(buyPrice) : null;

  // Capture price at the moment the purchase starts
  useEffect(() => {
    if (isPurchasing && !paidPrice && buyPriceFormatted) {
      setPaidPrice(buyPriceFormatted);
    }
  }, [isPurchasing, paidPrice, buyPriceFormatted]);

  // Reset paid price when dialog closes
  useEffect(() => {
    if (!open) {
      setPaidPrice(null);
    }
  }, [open]);

  // Auto-close after showing success
  useEffect(() => {
    if (!purchaseSuccess) return;
    const timer = setTimeout(() => onOpenChange(false), 3500);
    return () => clearTimeout(timer);
  }, [purchaseSuccess, onOpenChange]);

  const isSoldOut = currentHolders >= MAX_SUPPLY;

  const explorerUrl = txDigest ? getTxUrl(txDigest) : null;

  const handleConfirm = async () => {
    await onConfirm();
  };

  // Prevent the backdrop from closing the dialog while a purchase is in
  // progress or while the success screen is visible.  The wallet popup
  // dismiss event can propagate to the backdrop and call onOpenChange(false)
  // before React has a chance to render the success state, resetting it
  // immediately and hiding the confirmation screen.
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && (isPurchasing || purchaseSuccess)) return;
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="bg-white max-w-md">
        {purchaseSuccess ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-gray-900 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                Share Purchased!
              </DialogTitle>
              <DialogDescription className="text-gray-600">
                Your on-chain transaction was confirmed
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="flex justify-center py-2">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-9 h-9 text-green-500" />
                </div>
              </div>

              <div className="text-center">
                <p className="text-gray-900 font-medium">
                  You now hold a share of{' '}
                  <span className="text-purple-600">@{targetUsername}</span>
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Private domain access is now unlocked
                </p>
              </div>

              {paidPrice && (
                <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-100">
                  <span className="text-sm text-gray-600">Amount paid</span>
                  <span className="font-bold text-green-700">{paidPrice} SUI</span>
                </div>
              )}

              {explorerUrl && (
                <div className="flex justify-center">
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                  >
                    View transaction on explorer
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                onClick={() => onOpenChange(false)}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-gray-900 flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-purple-500" />
                {isGraduated ? 'Buy Token' : 'Buy Share'}
              </DialogTitle>
              <DialogDescription className="text-gray-600">
                {isGraduated
                  ? `Purchase $${graduationState.tokenSymbol} token`
                  : `Purchase a share of @${targetUsername}'s market`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Target User Info */}
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200">
                {targetAvatarUrl ? (
                  <img
                    src={targetAvatarUrl}
                    alt={targetUsername}
                    className="w-12 h-12 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-cyan-400 flex items-center justify-center text-white font-semibold">
                    {targetUsername.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">
                    @{targetUsername}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {isGraduated ? currentHolders : `${currentHolders}/${MAX_SUPPLY}`}
                  </div>
                  <div className="text-xs text-gray-500">{isGraduated ? 'token holders' : 'holders'}</div>
                </div>
              </div>

              {isSoldOut ? (
                isAwaitingGraduation ? (
                  <Alert className="border-purple-200 bg-purple-50">
                    <Info className="w-4 h-4 text-purple-600" />
                    <AlertDescription className="text-purple-700">
                      Market full &mdash; awaiting token launch. Shares will convert to tokens once the creator graduates.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert className="border-amber-200 bg-amber-50">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <AlertDescription className="text-amber-700">
                      This market is sold out. Maximum {MAX_SUPPLY} shares reached.
                    </AlertDescription>
                  </Alert>
                )
              ) : (
                <>
                  {/* Price Info */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-100">
                      <div className="text-sm text-gray-700">Share Price</div>
                      <div className="font-bold text-purple-600 text-lg">
                        {buyPriceFormatted} SUI
                      </div>
                    </div>

                    {/* Bonding Curve Info */}
                    <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <TrendingUp className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <div className="text-xs text-blue-700">
                        <span className="font-medium">Bonding curve pricing:</span> Price increases with each new holder.
                        Early supporters pay less!
                      </div>
                    </div>
                  </div>

                  {/* Explanation */}
                  <div className="text-xs text-gray-500 space-y-1">
                    <p>By purchasing a share:</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      <li>You'll own 1 share (max 1 per wallet)</li>
                      <li>You can sell anytime and receive a refund based on current price</li>
                      <li>Share price follows a bonding curve formula</li>
                    </ul>
                  </div>
                </>
              )}

              {/* Error Display */}
              {error && (
                <Alert className="border-red-200 bg-red-50">
                  <AlertDescription className="text-red-700">{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isPurchasing}
                className="border-gray-300"
              >
                Cancel
              </Button>
              {!isSoldOut && (
                <Button
                  onClick={handleConfirm}
                  disabled={isPurchasing || !buyPrice}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                >
                  {isPurchasing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Purchasing...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      Buy for {buyPriceFormatted} SUI
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
