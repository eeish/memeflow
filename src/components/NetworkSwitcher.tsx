import React, { useState } from 'react';
import { Button } from './ui-simple/Button';
import { Card } from './ui-simple/Card';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui-simple/dropdown-menu';
import { Badge } from './ui-simple/Badge';
import { 
  ChevronDown, 
  Globe, 
  ExternalLink, 
  Zap,
  CheckCircle,
  AlertTriangle,
  Home,
  Settings
} from './ui-simple/Icons';
import { useNetwork, useNetworkSwitcher } from '../contexts/NetworkContext';
import type { SuiNetworkName } from '../lib/networks';
import { getAllNetworks, networkHasFaucet } from '../lib/networks';

interface NetworkSwitcherProps {
  variant?: 'default' | 'compact' | 'full';
  showStatus?: boolean;
  showFaucetInfo?: boolean;
  className?: string;
}

export const NetworkSwitcher: React.FC<NetworkSwitcherProps> = ({
  variant = 'default',
  showStatus = true,
  showFaucetInfo = true,
  className = ''
}) => {
  const { networkConfig, getExplorerUrl } = useNetwork();
  const { currentNetwork, switchNetwork, isNetworkSupported } = useNetworkSwitcher();
  const [isOpen, setIsOpen] = useState(false);
  
  const allNetworks = getAllNetworks();

  const getNetworkIcon = (network: SuiNetworkName) => {
    switch (network) {
      case 'localnet':
        return <Home className="w-4 h-4" />;
      case 'devnet':
        return <Settings className="w-4 h-4" />;
      case 'testnet':
        return <AlertTriangle className="w-4 h-4" />;
      case 'mainnet':
        return <CheckCircle className="w-4 h-4" />;
      default:
        return <Globe className="w-4 h-4" />;
    }
  };

  const getStatusColor = (network: SuiNetworkName) => {
    // High contrast colors with shadow for maximum visibility (WCAG 2.1 AA+ compliance)
    switch (network) {
      case 'localnet':
        return 'bg-emerald-300 border border-emerald-200 shadow-sm shadow-emerald-400/50'; // Bright green for local
      case 'devnet':
        return 'bg-sky-300 border border-sky-200 shadow-sm shadow-sky-400/50'; // Bright blue for dev
      case 'testnet':
        return 'bg-yellow-300 border border-yellow-200 shadow-sm shadow-yellow-400/50'; // Bright yellow for test
      case 'mainnet':
        return 'bg-rose-300 border border-rose-200 shadow-sm shadow-rose-400/50'; // Bright red for main
      default:
        return 'bg-slate-300 border border-slate-200 shadow-sm shadow-slate-400/50'; // Bright gray fallback
    }
  };

  // Compact variant - just a small indicator
  if (variant === 'compact') {
    return (
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`h-8 w-8 p-0 bg-white/10 hover:bg-white/15 border border-white/30 text-white hover:text-cyan-200 transition-all duration-200 ${className}`}
          >
            <div className="relative">
              <div className="text-cyan-200">
                {getNetworkIcon(currentNetwork)}
              </div>
              <div 
                className={`absolute -bottom-1 -right-1 w-2 h-2 rounded-full ${getStatusColor(currentNetwork)}`}
              />
            </div>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-slate-800/95 border-white/20 backdrop-blur-md">
          <DropdownMenuLabel className="text-white font-semibold">Switch Network</DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-white/20" />
          {allNetworks.map((network) => (
            <DropdownMenuItem
              key={network.name}
              onClick={() => switchNetwork(network.name)}
              className="flex items-center space-x-3 cursor-pointer text-white hover:bg-white/10 focus:bg-white/10"
            >
              <div className="flex items-center space-x-2">
                <div className="text-cyan-200">{getNetworkIcon(network.name)}</div>
                <span className="font-medium text-white">{network.displayName}</span>
              </div>
              {network.name === currentNetwork && (
                <CheckCircle className="w-4 h-4 text-emerald-400 ml-auto" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Full variant - detailed network card
  if (variant === 'full') {
    return (
      <Card className={`bg-white border border-[#ECECEC] p-6 ${className}`}>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Network Settings</h3>
            <Globe className="w-5 h-5 text-blue-600" />
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Current Network</span>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${getStatusColor(currentNetwork)}`} />
                <span className="text-gray-900 font-medium">{networkConfig.displayName}</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-gray-600">RPC Endpoint</span>
              <span className="text-xs text-blue-600 font-mono">
                {networkConfig.rpcUrl.split('//')[1]?.split(':')[0] || networkConfig.rpcUrl}
              </span>
            </div>
            
            {showFaucetInfo && networkHasFaucet(currentNetwork) && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Faucet</span>
                <Badge variant="outline" className="text-green-700 border-green-300 bg-green-50">
                  Available
                </Badge>
              </div>
            )}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between bg-gray-50 border-gray-300 text-gray-900 hover:bg-gray-100 hover:border-gray-400 transition-all duration-200"
              >
                <span className="flex items-center space-x-2">
                  <div className="text-blue-600">{getNetworkIcon(currentNetwork)}</div>
                  <span>{networkConfig.displayName}</span>
                </span>
                <ChevronDown className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-full bg-white border border-gray-200">
              <DropdownMenuLabel className="text-gray-900 font-semibold">Available Networks</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-gray-200" />
              {allNetworks.map((network) => (
                <DropdownMenuItem
                  key={network.name}
                  onClick={() => switchNetwork(network.name)}
                  className="flex items-center justify-between cursor-pointer text-gray-900 hover:bg-gray-100 focus:bg-gray-100"
                >
                  <div className="flex items-center space-x-2">
                    <div className="text-blue-600">{getNetworkIcon(network.name)}</div>
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-900">{network.displayName}</span>
                      <span className="text-xs text-gray-600">{network.description}</span>
                    </div>
                  </div>
                  {network.name === currentNetwork && (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex space-x-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs bg-gray-50 border-gray-300 text-blue-600 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              onClick={() => window.open(getExplorerUrl(), '_blank')}
            >
              <ExternalLink className="w-3 h-3 mr-1" />
              Explorer
            </Button>
            
            {networkHasFaucet(currentNetwork) && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1 text-xs bg-gray-50 border-gray-300 text-green-600 hover:bg-green-50 hover:text-green-700 transition-colors"
                onClick={() => window.open(networkConfig.faucetUrl!, '_blank')}
              >
                <Zap className="w-3 h-3 mr-1" />
                Faucet
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  // Default variant - button with dropdown
  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={`bg-white/10 border-white/30 text-white hover:bg-white/15 hover:border-white/40 transition-all duration-200 ${className}`}
        >
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${getStatusColor(currentNetwork)}`} />
            <span>{networkConfig.displayName}</span>
            {showStatus && (
              <Badge 
                variant="outline" 
                className="text-xs"
                style={{ color: networkConfig.color, borderColor: `${networkConfig.color}50` }}
              >
                {networkConfig.icon}
              </Badge>
            )}
          </div>
          <ChevronDown className="w-4 h-4 ml-2" />
        </Button>
      </DropdownMenuTrigger>
      
      <DropdownMenuContent align="end" className="w-64 bg-slate-800/95 border-white/20 backdrop-blur-md">
        <DropdownMenuLabel className="flex items-center space-x-2 text-white font-semibold">
          <Globe className="w-4 h-4 text-cyan-200" />
          <span>Switch Network</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/20" />
        
        {allNetworks.map((network) => (
          <DropdownMenuItem
            key={network.name}
            onClick={() => switchNetwork(network.name)}
            className="flex items-center justify-between cursor-pointer p-3 text-white hover:bg-white/10 focus:bg-white/10"
            disabled={!isNetworkSupported(network.name)}
          >
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <div className="text-cyan-200">{getNetworkIcon(network.name)}</div>
                <div className={`w-2 h-2 rounded-full ${getStatusColor(network.name)}`} />
              </div>
              <div className="flex flex-col">
                <span className="font-medium text-white">{network.displayName}</span>
                <span className="text-xs text-white/60">{network.description}</span>
              </div>
            </div>
            
            <div className="flex items-center space-x-1">
              {networkHasFaucet(network.name) && (
                <Zap className="w-3 h-3 text-yellow-400" />
              )}
              {network.name === currentNetwork && (
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              )}
            </div>
          </DropdownMenuItem>
        ))}
        
        <DropdownMenuSeparator className="bg-white/20" />
        
        <DropdownMenuItem
          onClick={() => window.open(getExplorerUrl(), '_blank')}
          className="flex items-center space-x-2 cursor-pointer text-cyan-300 hover:bg-white/10 focus:bg-white/10 hover:text-cyan-200"
        >
          <ExternalLink className="w-4 h-4" />
          <span>View in Explorer</span>
        </DropdownMenuItem>
        
        {networkHasFaucet(currentNetwork) && (
          <DropdownMenuItem
            onClick={() => window.open(networkConfig.faucetUrl!, '_blank')}
            className="flex items-center space-x-2 cursor-pointer text-emerald-300 hover:bg-white/10 focus:bg-white/10 hover:text-emerald-200"
          >
            <Zap className="w-4 h-4" />
            <span>Get Test SUI</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
