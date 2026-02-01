import React, { useState } from 'react';
import { Button } from './ui-simple/Button';
import { Coins } from './ui-simple/Icons';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useNotifications } from '../contexts/NotificationContext';

export const FaucetButton: React.FC = () => {
  const account = useCurrentAccount();
  const notifications = useNotifications();
  const [loading, setLoading] = useState(false);
  
  const requestFromFaucet = async () => {
    if (!account) {
      notifications.warning('Please connect your wallet first', {
        display: 'toast'
      });
      return;
    }
    
    setLoading(true);
    notifications.info('Requesting SUI from faucet...', {
      display: 'toast',
      duration: 2000
    });
    
    try {
      const response = await fetch('https://faucet.devnet.sui.io/v1/gas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          FixedAmountRequest: {
            recipient: account.address,
          },
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        notifications.success(`Successfully received SUI from faucet!`, {
          display: 'toast',
          metadata: { txId: data.task },
          actions: [{
            label: 'View TX',
            action: () => window.open(`https://suiscan.xyz/devnet/tx/${data.task}`, '_blank'),
            variant: 'primary'
          }]
        });
        notifications.debug('Faucet response', { metadata: data });
      } else {
        const error = await response.text();
        notifications.error(`Faucet request failed: ${error}`, {
          display: 'toast'
        });
      }
    } catch (error) {
      console.error('Faucet request failed:', error);
      notifications.error(`Failed to request from faucet: ${error.message}`, {
        display: 'toast'
      });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="space-y-2">
      <Button 
        onClick={requestFromFaucet} 
        disabled={loading || !account}
        className="bg-blue-600 hover:bg-blue-700"
      >
        <Coins className="w-4 h-4 mr-2" />
        {loading ? 'Requesting...' : 'Get SUI from Faucet'}
      </Button>
      {account && (
        <p className="text-xs text-gray-500">
          Your wallet: {account.address.slice(0, 10)}...{account.address.slice(-8)}
        </p>
      )}
    </div>
  );
};
