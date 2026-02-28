import React from 'react';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useNetwork } from '../contexts/NetworkContext';
import { InlineNotification } from './notifications/InlineNotification';

export const NetworkWarning: React.FC = () => {
  const account = useCurrentAccount();
  const { currentNetwork } = useNetwork();

  // Only show when contracts are deployed on testnet
  if (!account || currentNetwork !== 'testnet') {
    return null;
  }

  return (
    <InlineNotification
      type="warning"
      title="Network Configuration"
      message="Cord contracts are currently deployed on Testnet. Please ensure your wallet is connected to Testnet to interact with the contracts."
      className="mb-4"
    >
      <div className="mt-3 p-3 bg-amber-100 rounded-md">
        <p className="font-semibold text-sm mb-2">To switch to Testnet in your wallet:</p>
        <ol className="text-sm space-y-1 list-decimal list-inside">
          <li>Open your Sui wallet extension</li>
          <li>Click on the network selector (usually shows "Mainnet" or "Devnet")</li>
          <li>Select "Testnet" from the list</li>
          <li>Refresh this page after switching</li>
        </ol>
      </div>
      <div className="mt-3 text-xs text-amber-600">
        Current app network: <strong>{currentNetwork}</strong>
      </div>
    </InlineNotification>
  );
};
