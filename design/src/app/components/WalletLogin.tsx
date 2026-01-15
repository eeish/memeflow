import { useState } from 'react';
import { WalletFactory, WalletAccount } from './wallet/WalletAdapter';

interface WalletLoginProps {
  onLogin: (account: WalletAccount) => void;
}

type ChainType = 'sui' | 'ethereum';

export function WalletLogin({ onLogin }: WalletLoginProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedChain, setSelectedChain] = useState<ChainType | null>(null);

  const handleConnect = async (chain: ChainType) => {
    setIsConnecting(true);
    setSelectedChain(chain);

    try {
      const adapter = WalletFactory.createAdapter(chain);
      const account = await adapter.connect();
      onLogin(account);
    } catch (error) {
      console.error('Wallet connection failed:', error);
      setIsConnecting(false);
      setSelectedChain(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="text-center mb-12">
          <h1 className="text-4xl tracking-tight text-gray-900 mb-2">Cord</h1>
          <p className="text-sm text-gray-600">Connect your wallet to continue</p>
        </div>

        {/* Wallet Options */}
        <div className="space-y-3">
          <button
            onClick={() => handleConnect('sui')}
            disabled={isConnecting}
            className={`w-full bg-white border border-gray-200 p-4 hover:border-gray-300 transition-colors text-left ${
              isConnecting && selectedChain === 'sui' ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base text-gray-900 mb-1">Sui</div>
                <div className="text-xs text-gray-500">Sui Wallet, Suiet, Ethos</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex-shrink-0" />
            </div>
            {isConnecting && selectedChain === 'sui' && (
              <div className="mt-3 text-xs text-gray-600">Connecting...</div>
            )}
          </button>

          <button
            onClick={() => handleConnect('ethereum')}
            disabled={isConnecting}
            className={`w-full bg-white border border-gray-200 p-4 hover:border-gray-300 transition-colors text-left ${
              isConnecting && selectedChain === 'ethereum' ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-base text-gray-900 mb-1">Ethereum</div>
                <div className="text-xs text-gray-500">MetaMask, WalletConnect, Coinbase</div>
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex-shrink-0" />
            </div>
            {isConnecting && selectedChain === 'ethereum' && (
              <div className="mt-3 text-xs text-gray-600">Connecting...</div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}