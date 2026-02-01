import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './Dialog';
import { Button } from './Button';
import { Wallet } from './Icons';

interface WalletPickerModalProps {
  open: boolean;
  onClose: () => void;
  wallets: any[];
  onSelectWallet: (wallet: any) => void;
  network: string;
}

export function WalletPickerModal({
  open,
  onClose,
  wallets,
  onSelectWallet,
  network,
}: WalletPickerModalProps) {
  // List of known wallets for install links
  const knownWallets = [
    { name: 'Suiet', url: 'https://suiet.app/' },
    { name: 'Sui Wallet', url: 'https://chrome.google.com/webstore/detail/sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil' },
    { name: 'Ethos Wallet', url: 'https://ethoswallet.xyz/' },
  ];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Choose a wallet</DialogTitle>
        </DialogHeader>

        {wallets.length > 0 ? (
          <div className="space-y-2">
            {wallets.map((wallet) => (
              <button
                key={wallet.name}
                onClick={() => onSelectWallet(wallet)}
                className="w-full flex items-center gap-3 p-4 bg-white border border-gray-200 rounded-lg hover:border-gray-900 transition-colors text-left"
              >
                {wallet.icon && (
                  <img src={wallet.icon} alt={wallet.name} className="w-8 h-8 rounded" />
                )}
                <span className="font-medium text-gray-900">{wallet.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center">
            <Wallet className="w-12 h-12 mx-auto mb-4 text-gray-400" />
            <p className="text-gray-900 font-medium mb-6">
              No wallet detected for {network}.
            </p>
            <div className="space-y-3 mb-6">
              {knownWallets.map((wallet) => (
                <a
                  key={wallet.name}
                  href={wallet.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-gray-900 transition-colors"
                >
                  <span className="text-gray-900">{wallet.name}</span>
                  <span className="text-sm text-gray-600">Install</span>
                </a>
              ))}
            </div>
            <Button
              onClick={() => window.location.reload()}
              variant="outline"
              className="w-full mb-2"
            >
              Refresh
            </Button>
          </div>
        )}

        <Button onClick={onClose} variant="outline" className="w-full mt-2">
          Cancel
        </Button>
      </DialogContent>
    </Dialog>
  );
}
