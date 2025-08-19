import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useNetwork } from '../contexts/NetworkContext';

export const NetworkWarning: React.FC = () => {
  const account = useCurrentAccount();
  const { currentNetwork } = useNetwork();
  
  // Only show on devnet when contracts are deployed there
  if (!account || currentNetwork !== 'devnet') {
    return null;
  }

  return (
    <Alert className="mb-4 bg-amber-50 border-amber-200">
      <AlertCircle className="h-4 w-4 text-amber-600" />
      <AlertTitle className="text-amber-800">Network Configuration</AlertTitle>
      <AlertDescription className="text-amber-700">
        <div className="mt-2 space-y-2">
          <p>
            MemeFlow contracts are currently deployed on <strong>Devnet</strong>.
          </p>
          <p className="text-sm">
            Please ensure your wallet is connected to Devnet to interact with the contracts.
          </p>
          <div className="mt-3 p-3 bg-amber-100 rounded-md">
            <p className="font-semibold text-sm mb-2">To switch to Devnet in your wallet:</p>
            <ol className="text-sm space-y-1 list-decimal list-inside">
              <li>Open your Sui wallet extension</li>
              <li>Click on the network selector (usually shows "Mainnet" or "Testnet")</li>
              <li>Select "Devnet" from the list</li>
              <li>Refresh this page after switching</li>
            </ol>
          </div>
          <div className="mt-3 text-xs text-amber-600">
            Current app network: <strong>{currentNetwork}</strong>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
};