// Network configuration - Package IDs are loaded from deployment JSON files
// DO NOT hardcode package IDs here - they are automatically updated by deploy.sh in public/deployment-{network}.json
// This ensures the frontend always uses the latest deployed contracts

export const DEPLOYMENT_CONFIG = {
  local: {
    network: 'local',
    rpcUrl: 'http://127.0.0.1:9000',
    explorerUrl: 'http://localhost:3000',
    packageId: '0x0000000000000000000000000000000000000000000000000000000000000000',
    factoryId: '0x0000000000000000000000000000000000000000000000000000000000000000',
    poolCreationCapId: '',
    deploymentTx: '',
    initTx: '',
    deployer: '0x0000000000000000000000000000000000000000000000000000000000000000',
    timestamp: ''
  },
  devnet: {
    network: 'devnet',
    rpcUrl: 'https://fullnode.devnet.sui.io:443',
    explorerUrl: 'https://suiscan.xyz/devnet',
    packageId: '0x0000000000000000000000000000000000000000000000000000000000000000',
    factoryId: '0x0000000000000000000000000000000000000000000000000000000000000000',
    poolCreationCapId: '',
    deploymentTx: '',
    initTx: '',
    deployer: '0x0000000000000000000000000000000000000000000000000000000000000000',
    timestamp: ''
  },
  testnet: {
    network: 'testnet',
    rpcUrl: 'https://fullnode.testnet.sui.io:443',
    explorerUrl: 'https://suiscan.xyz/testnet',
    packageId: '0x0000000000000000000000000000000000000000000000000000000000000000',
    factoryId: '0x0000000000000000000000000000000000000000000000000000000000000000',
    poolCreationCapId: '',
    deploymentTx: '',
    initTx: '',
    deployer: '0x0000000000000000000000000000000000000000000000000000000000000000',
    timestamp: ''
  },
  mainnet: {
    network: 'mainnet',
    rpcUrl: 'https://fullnode.mainnet.sui.io:443',
    explorerUrl: 'https://suiscan.xyz/mainnet',
    packageId: '0x0000000000000000000000000000000000000000000000000000000000000000',
    factoryId: '0x0000000000000000000000000000000000000000000000000000000000000000',
    poolCreationCapId: '',
    deploymentTx: '',
    initTx: '',
    deployer: '0x0000000000000000000000000000000000000000000000000000000000000000',
    timestamp: ''
  }
} as const;

// Default network (set by deployment script)
export const CURRENT_NETWORK = (
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUI_NETWORK) || 
  'testnet'
) as keyof typeof DEPLOYMENT_CONFIG;

export const CURRENT_DEPLOYMENT = DEPLOYMENT_CONFIG[CURRENT_NETWORK];

// Network configurations
export const NETWORKS = {
  local: {
    rpc: 'http://127.0.0.1:9000',
    explorer: 'http://localhost:3000',
    faucet: 'http://127.0.0.1:9123'
  },
  devnet: {
    rpc: 'https://fullnode.devnet.sui.io:443',
    explorer: 'https://suiscan.xyz/devnet',
    faucet: 'https://faucet.devnet.sui.io'
  },
  testnet: {
    rpc: 'https://fullnode.testnet.sui.io:443',
    explorer: 'https://suiscan.xyz/testnet',
    faucet: 'https://faucet.testnet.sui.io'
  },
  mainnet: {
    rpc: 'https://fullnode.mainnet.sui.io:443',
    explorer: 'https://suiscan.xyz/mainnet',
    faucet: null
  }
} as const;

export type NetworkType = keyof typeof NETWORKS;
export type DeploymentConfig = typeof CURRENT_DEPLOYMENT;

// Validation helpers
export const isValidAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{64}$/.test(address);
};

export const isValidNetwork = (network: string): network is NetworkType => {
  return network in NETWORKS;
};

export const isDeploymentReady = (network: NetworkType = CURRENT_NETWORK): boolean => {
  const deployment = DEPLOYMENT_CONFIG[network];
  return (
    isValidAddress(deployment.packageId) &&
    isValidAddress(deployment.factoryId) &&
    deployment.packageId !== '0x0000000000000000000000000000000000000000000000000000000000000000'
  );
};

// Environment variable helpers
export const getEnvConfig = () => {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  return {
    network: env.VITE_SUI_NETWORK || CURRENT_NETWORK,
    rpcUrl: env.VITE_SUI_RPC_URL || CURRENT_DEPLOYMENT.rpcUrl,
    packageId: env.VITE_PACKAGE_ID || CURRENT_DEPLOYMENT.packageId,
    factoryId: env.VITE_FACTORY_ID || CURRENT_DEPLOYMENT.factoryId,
    explorerUrl: env.VITE_EXPLORER_URL || CURRENT_DEPLOYMENT.explorerUrl,
  };
};

// Contract addresses and IDs
export const CONTRACT_IDS = {
  get packageId() {
    return getEnvConfig().packageId;
  },
  get factoryId() {
    return getEnvConfig().factoryId;
  },
  get poolCreationCapId() {
    return CURRENT_DEPLOYMENT.poolCreationCapId;
  }
};

// Network utilities
export const getNetworkConfig = (network?: NetworkType) => {
  const targetNetwork = network || CURRENT_NETWORK;
  return {
    ...NETWORKS[targetNetwork],
    deployment: DEPLOYMENT_CONFIG[targetNetwork]
  };
};

export const getExplorerUrl = (network?: NetworkType) => {
  return getNetworkConfig(network).deployment.explorerUrl;
};

export const getTxUrl = (txHash: string, network?: NetworkType) => {
  return `${getExplorerUrl(network)}/txblock/${txHash}`;
};

export const getObjectUrl = (objectId: string, network?: NetworkType) => {
  return `${getExplorerUrl(network)}/object/${objectId}`;
};

// Development helpers
export const isDevelopment = () => (typeof import.meta !== 'undefined' && import.meta.env?.DEV) || false;
export const isProduction = () => (typeof import.meta !== 'undefined' && import.meta.env?.PROD) || false;
export const isLocalNetwork = () => CURRENT_NETWORK === 'local';
export const isMainnet = () => CURRENT_NETWORK === 'mainnet';

// Configuration validation
export const validateConfig = () => {
  const issues: string[] = [];
  
  if (!isValidNetwork(CURRENT_NETWORK)) {
    issues.push(`Invalid network: ${CURRENT_NETWORK}`);
  }
  
  if (!isValidAddress(CONTRACT_IDS.packageId)) {
    issues.push(`Invalid package ID: ${CONTRACT_IDS.packageId}`);
  }
  
  if (!isValidAddress(CONTRACT_IDS.factoryId)) {
    issues.push(`Invalid factory ID: ${CONTRACT_IDS.factoryId}`);
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
};

// Configuration status
export const getConfigStatus = () => {
  const config = getEnvConfig();
  const validation = validateConfig();
  const deploymentReady = isDeploymentReady();
  
  return {
    network: config.network,
    deploymentReady,
    validation,
    contracts: {
      packageId: config.packageId,
      factoryId: config.factoryId,
      packageUrl: getObjectUrl(config.packageId),
      factoryUrl: getObjectUrl(config.factoryId),
    },
    urls: {
      rpc: config.rpcUrl,
      explorer: config.explorerUrl,
      faucet: NETWORKS[CURRENT_NETWORK].faucet
    }
  };
};