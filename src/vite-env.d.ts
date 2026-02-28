/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PACKAGE_ID: string
  readonly VITE_GRADUATION_REGISTRY_ID?: string
  readonly VITE_MAX_SUPPLY?: string
  readonly VITE_NETWORK: string
  readonly VITE_LOCAL_RPC?: string
  readonly VITE_TESTNET_RPC?: string
  readonly VITE_MAINNET_RPC?: string
  readonly VITE_DEVNET_RPC?: string
  readonly VITE_ENABLE_DEBUG?: string
  readonly VITE_ENABLE_DEV_TOOLS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
