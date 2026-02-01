import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { WalletProvider, SuiClientProvider, createNetworkConfig } from '@mysten/dapp-kit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { getFullnodeUrl } from '@mysten/sui.js/client'
import './index.css'
import App from './App'

// Configure QueryClient with proper settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: 1000,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
    },
    mutations: {
      // IMPORTANT: Do not retry mutations automatically.
      // User-initiated actions like wallet signing should never auto-retry
      // as rejection is intentional, not a transient failure.
      retry: false,
    },
  },
})

// Network configuration with proper chain identifiers
const { networkConfig } = createNetworkConfig({
  testnet: { 
    url: import.meta.env.VITE_TESTNET_RPC || getFullnodeUrl('testnet')
  },
  mainnet: { 
    url: import.meta.env.VITE_MAINNET_RPC || getFullnodeUrl('mainnet')
  },
  devnet: { 
    url: import.meta.env.VITE_DEVNET_RPC || getFullnodeUrl('devnet')
  },
  // For local networks, we'll use testnet config as fallback since local doesn't have standard chain ID
  local: { 
    url: import.meta.env.VITE_LOCAL_RPC || 'http://127.0.0.1:9000'
  },
})

const defaultNetwork = (import.meta.env.VITE_NETWORK as keyof typeof networkConfig) || 'testnet'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork={defaultNetwork}>
        <WalletProvider autoConnect enableUnsafeBurner>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </StrictMode>,
)
