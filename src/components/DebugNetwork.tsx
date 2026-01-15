import React from 'react';
import { useSuiClient, useCurrentAccount } from '@mysten/dapp-kit';
import { useNetwork } from '../contexts/NetworkContext';
import { useNotifications } from '../contexts/NotificationContext';
import { Card } from './ui-simple/Card';
import { Button } from './ui-simple/Button';

export const DebugNetwork: React.FC = () => {
  const client = useSuiClient();
  const account = useCurrentAccount();
  const { currentNetwork } = useNetwork();
  const notifications = useNotifications();
  const [objectExists, setObjectExists] = React.useState<boolean | null>(null);
  const [checking, setChecking] = React.useState(false);
  
  const registryId = import.meta.env.VITE_PROFILE_REGISTRY_ID;
  const packageId = import.meta.env.VITE_PACKAGE_ID;
  
  const checkObject = async () => {
    setChecking(true);
    notifications.debug(`Checking registry object: ${registryId}`, {
      metadata: { registryId, network: currentNetwork }
    });
    
    try {
      const obj = await client.getObject({
        id: registryId,
        options: { showContent: false }
      });
      setObjectExists(!!obj);
      
      if (obj) {
        notifications.success('Registry object found and accessible', {
          display: 'toast',
          duration: 3000
        });
        notifications.debug('Object details', { metadata: obj });
      } else {
        notifications.error('Registry object not found', {
          display: 'toast'
        });
      }
    } catch (error) {
      console.error('Failed to fetch object:', error);
      setObjectExists(false);
      notifications.error(`Failed to fetch registry object: ${error}`, {
        display: 'toast'
      });
    }
    setChecking(false);
  };
  
  React.useEffect(() => {
    if (registryId && registryId !== '0x0') {
      checkObject();
    }
  }, [registryId]);
  
  return (
    <Card className="p-4 bg-yellow-50 border-yellow-200">
      <h3 className="font-semibold mb-2">🔧 Network Debug Info</h3>
      <div className="space-y-1 text-sm">
        <div>Network: <span className="font-mono">{currentNetwork}</span></div>
        <div>RPC: <span className="font-mono text-xs">{client.url}</span></div>
        <div>Wallet: <span className="font-mono text-xs">{account?.address || 'Not connected'}</span></div>
        <div>Package: <span className="font-mono text-xs">{packageId}</span></div>
        <div>Registry: <span className="font-mono text-xs">{registryId}</span></div>
        <div className="flex items-center gap-2">
          Registry Status: 
          {checking ? (
            <span className="text-gray-500">Checking...</span>
          ) : objectExists === null ? (
            <span className="text-gray-500">Not checked</span>
          ) : objectExists ? (
            <span className="text-green-600">✓ Found</span>
          ) : (
            <span className="text-red-600">✗ Not found</span>
          )}
          <Button size="sm" variant="outline" onClick={checkObject} disabled={checking}>
            Recheck
          </Button>
        </div>
      </div>
    </Card>
  );
};