import React, { useState } from 'react';
import { Button } from './ui-simple/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui-simple/Dialog';
import { Sparkles, Rocket, Loader2 } from './ui-simple/Icons';
import { formatMistToSui } from '../hooks/useShareMarket';
import type { GraduationConfig } from '../lib/graduation';

interface GraduationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  holdersCount: number;
  treasuryMist: bigint;
  onGraduate: (config: GraduationConfig) => Promise<void>;
  launchStatus?: 'queued' | 'running' | 'completed' | 'failed';
  launchStep?: string;
  operatorAddress?: string;
}

export const GraduationDialog: React.FC<GraduationDialogProps> = ({
  open,
  onOpenChange,
  username,
  holdersCount,
  treasuryMist,
  onGraduate,
  launchStatus,
  launchStep,
  operatorAddress,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tokenName, setTokenName] = useState(`${username} Token`);
  const [tokenSymbol, setTokenSymbol] = useState(
    username.slice(0, 4).toUpperCase(),
  );
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const treasuryFormatted = formatMistToSui(treasuryMist);

  const handleLaunch = async () => {
    setIsLaunching(true);
    setLaunchError(null);
    try {
      await onGraduate({ tokenName, tokenSymbol: tokenSymbol.toUpperCase() });
      setStep(3);
    } catch (error: unknown) {
      setLaunchError(error instanceof Error ? error.message : 'Launch failed');
    } finally {
      setIsLaunching(false);
    }
  };

  const handleClose = () => {
    setLaunchError(null);
    onOpenChange(false);
    setTimeout(() => setStep(1), 200);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-white max-w-md">
        {step === 1 && (
          <>
            <DialogHeader>
              <DialogTitle className="text-gray-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                Your market is fully subscribed!
              </DialogTitle>
              <DialogDescription className="text-gray-600">
                One wallet signature is enough. Cord handles the launch flow after that.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg border border-purple-100">
                <div className="text-sm text-gray-600 mb-1">Treasury accumulated</div>
                <div className="text-2xl font-bold text-purple-600">
                  {treasuryFormatted} SUI
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  From {holdersCount} share purchases
                </div>
              </div>
              <p className="text-sm text-gray-600">
                Cord will publish the token package, graduate the market, initialize the protocol-owned
                AMM pool, and seed the launch liquidity from the operator wallet.
              </p>
              {operatorAddress && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-xs text-gray-600">
                  <div className="font-medium text-gray-700">Operator wallet</div>
                  <div className="mt-1 font-mono text-[11px] text-gray-500 break-all">
                    {operatorAddress}
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleClose}
                className="border-gray-300"
              >
                Later
              </Button>
              <Button
                onClick={() => setStep(2)}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
              >
                Continue
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 2 && (
          <>
            <DialogHeader>
              <DialogTitle className="text-gray-900 flex items-center gap-2">
                <Rocket className="w-5 h-5 text-purple-500" />
                Configure your token
              </DialogTitle>
              <DialogDescription className="text-gray-600">
                Choose a name and symbol, then authorize Cord to finish the token launch and AMM setup.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Token Name
                </label>
                <input
                  type="text"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g. Creator Token"
                  maxLength={32}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Token Symbol
                </label>
                <input
                  type="text"
                  value={tokenSymbol}
                  onChange={(e) =>
                    setTokenSymbol(e.target.value.toUpperCase().slice(0, 6))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm uppercase focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="e.g. CRTK"
                  maxLength={6}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Max 6 characters, uppercase
                </p>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                <div className="text-xs text-gray-500 mb-2">Preview</div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-sm">
                    {tokenSymbol.charAt(0) || '?'}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">
                      {tokenName || 'Token Name'}
                    </div>
                    <div className="text-xs text-purple-600">
                      ${tokenSymbol || 'SYM'}
                    </div>
                  </div>
                </div>
              </div>
              {launchError && (
                <p className="text-xs text-red-600">
                  {launchError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="border-gray-300"
              >
                Back
              </Button>
              <Button
                onClick={handleLaunch}
                disabled={isLaunching || !tokenName.trim() || !tokenSymbol.trim()}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
              >
                {isLaunching ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Authorizing...
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4 mr-2" />
                    Authorize Launch
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 3 && (
          <>
            <DialogHeader>
              <DialogTitle className="text-gray-900 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-green-500" />
                Launch queued for ${tokenSymbol}
              </DialogTitle>
              <DialogDescription className="text-gray-600">
                Cord accepted your authorization and is finishing the backend launch and pool initialization.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="p-4 bg-green-50 rounded-lg border border-green-100">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold">
                    {tokenSymbol.charAt(0)}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{tokenName}</div>
                    <div className="text-sm text-purple-600">${tokenSymbol}</div>
                  </div>
                </div>
                <div className="space-y-1 text-sm text-gray-600">
                  <p>{holdersCount} share holders will convert to token holders automatically.</p>
                  <p>{treasuryFormatted} SUI becomes the initial AMM-side treasury liquidity.</p>
                  <p>Status: {launchStatus === 'completed' ? 'Token live' : launchStep || 'Launching'}</p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleClose}
                className="bg-gray-900 hover:bg-gray-800 text-white"
              >
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
