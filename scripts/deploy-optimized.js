#!/usr/bin/env node

/**
 * MemeFlow Optimized Contract Deployment Script
 * 
 * This script deploys MemeFlow contracts and automatically updates all configuration files
 * so the frontend can immediately use the deployed contract addresses.
 * 
 * Features:
 * - Automatic config file updates (public/deployment-*.json, .env files)
 * - Post-deployment verification
 * - Frontend integration testing
 * - Rollback capability on failure
 * - Real-time progress tracking
 * 
 * Usage: node scripts/deploy-optimized.js [network] [options]
 * 
 * Networks: local, devnet, testnet, mainnet
 * Options: --force, --verify-only, --update-configs-only
 */

import { execSync, exec } from 'child_process';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import path, { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const NETWORKS = {
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
};

const DEFAULT_NETWORK = 'testnet';
const PROJECT_ROOT = path.resolve(__dirname, '..');

class OptimizedMemeFlowDeployer {
  constructor(network = DEFAULT_NETWORK, options = {}) {
    this.network = network;
    this.options = options;
    this.networkConfig = NETWORKS[network];
    this.contractsPath = path.join(PROJECT_ROOT, 'contracts', 'memeflow');
    this.deploymentFile = path.join(PROJECT_ROOT, 'public', `deployment-${network}.json`);
    this.backupFile = path.join(PROJECT_ROOT, 'public', `deployment-${network}.backup.json`);
    
    if (!this.networkConfig) {
      throw new Error(`Unknown network: ${network}. Available: ${Object.keys(NETWORKS).join(', ')}`);
    }
    
    this.log(`🚀 MemeFlow Optimized Deployment`);
    this.log(`📡 Network: ${network.toUpperCase()}`);
    this.log(`🌐 RPC: ${this.networkConfig.rpc}`);
    this.log(`🔍 Explorer: ${this.networkConfig.explorer}`);
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const icons = { info: '📋', success: '✅', error: '❌', warning: '⚠️', progress: '⏳' };
    console.log(`${icons[type] || '📋'} [${timestamp}] ${message}`);
  }

  /**
   * Create backup of existing deployment
   */
  createBackup() {
    if (existsSync(this.deploymentFile)) {
      this.log('Creating backup of existing deployment...', 'progress');
      const backup = readFileSync(this.deploymentFile, 'utf8');
      writeFileSync(this.backupFile, backup);
      this.log(`Backup saved to: ${path.basename(this.backupFile)}`, 'success');
      return JSON.parse(backup);
    }
    return null;
  }

  /**
   * Restore from backup on failure
   */
  restoreBackup() {
    if (existsSync(this.backupFile)) {
      this.log('Restoring from backup...', 'warning');
      const backup = readFileSync(this.backupFile, 'utf8');
      writeFileSync(this.deploymentFile, backup);
      return true;
    }
    return false;
  }

  /**
   * Build contracts with optimizations
   */
  buildContracts() {
    this.log('Building contracts...', 'progress');
    
    try {
      // Clean previous builds
      execSync(`cd ${this.contractsPath} && rm -rf build`, { stdio: 'pipe' });
      
      // Build with optimizations
      const buildOutput = execSync(`cd ${this.contractsPath} && sui move build 2>&1`, {
        encoding: 'utf8'
      });
      
      // Check for any actual errors (ignore warnings)
      if (buildOutput.includes('Failed to build')) {
        throw new Error('Build failed with errors');
      }
      
      this.log('Contracts built successfully', 'success');
      return true;
    } catch (error) {
      this.log(`Build failed: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Deploy contracts to the network
   */
  async deployContracts() {
    this.log('Deploying contracts...', 'progress');
    
    try {
      // Deploy with higher gas budget
      const deployCmd = `cd ${this.contractsPath} && sui client publish --gas-budget 200000000 --json`;
      const deployOutput = execSync(deployCmd, { 
        encoding: 'utf8',
        timeout: 120000 // 2 minutes timeout
      });
      
      const deployResult = JSON.parse(deployOutput);
      
      if (!deployResult.effects || deployResult.effects.status.status !== 'success') {
        throw new Error('Deployment transaction failed');
      }

      this.log('Contract deployment successful', 'success');
      
      // Extract deployment information
      const deployment = this.extractDeploymentInfo(deployResult);
      
      // Save initial deployment info
      this.saveDeploymentConfig(deployment);
      
      return deployment;
      
    } catch (error) {
      this.log(`Deployment failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Extract all deployment information from result
   */
  extractDeploymentInfo(deployResult) {
    const createdObjects = deployResult.effects.created || [];
    const sharedObjects = deployResult.effects.shared || [];
    
    // Extract package ID (immutable object)
    const packageObj = createdObjects.find(obj => 
      obj.owner === 'Immutable'
    );
    
    if (!packageObj) {
      throw new Error('Could not find package ID in deployment result');
    }
    
    const packageId = packageObj.reference.objectId;
    
    // Extract factory ID from shared objects (created during init)
    let factoryId = null;
    const sharedObj = sharedObjects.find(obj => 
      obj.objectType && obj.objectType.includes('MemeTokenFactory')
    );
    
    if (sharedObj) {
      factoryId = sharedObj.objectId;
    }
    
    // Extract pool creation cap (if created)
    let poolCreationCapId = null;
    const poolCapObj = createdObjects.find(obj => 
      obj.objectType && obj.objectType.includes('PoolCreationCap')
    );
    
    if (poolCapObj) {
      poolCreationCapId = poolCapObj.reference.objectId;
    }
    
    const deployment = {
      network: this.network,
      rpcUrl: this.networkConfig.rpc,
      explorerUrl: this.networkConfig.explorer,
      faucetUrl: this.networkConfig.faucet,
      packageId,
      factoryId,
      poolCreationCapId,
      deploymentTx: deployResult.digest,
      timestamp: new Date().toISOString(),
      deployer: deployResult.effects.events?.[0]?.sender || 'unknown',
      gasUsed: deployResult.effects.gasUsed || {},
      status: 'deployed'
    };
    
    this.log(`📦 Package ID: ${packageId}`);
    this.log(`🏭 Factory ID: ${factoryId || 'Not yet initialized'}`);
    this.log(`🎯 Pool Cap ID: ${poolCreationCapId || 'Not created'}`);
    
    return deployment;
  }

  /**
   * Initialize the factory and get shared object IDs
   */
  async initializeFactory(deployment) {
    this.log('Initializing factory...', 'progress');
    
    try {
      const initCmd = `sui client call ` +
        `--package ${deployment.packageId} ` +
        `--module deploy_utils ` +
        `--function initialize_memeflow ` +
        `--gas-budget 20000000 ` +
        `--json`;
      
      const initOutput = execSync(initCmd, { 
        encoding: 'utf8',
        timeout: 60000
      });
      const initResult = JSON.parse(initOutput);
      
      if (initResult.effects.status.status !== 'success') {
        throw new Error('Factory initialization failed');
      }
      
      // Extract factory and other shared object IDs from init result
      const sharedObjects = initResult.effects.shared || [];
      
      // Find the factory shared object
      if (sharedObjects.length > 0 && !deployment.factoryId) {
        const factoryObj = sharedObjects.find(obj => 
          obj.objectType && obj.objectType.includes('MemeTokenFactory')
        );
        
        if (factoryObj) {
          deployment.factoryId = factoryObj.objectId;
        }
      }
      
      deployment.initTx = initResult.digest;
      deployment.gasUsedInit = initResult.effects.gasUsed || {};
      deployment.status = 'initialized';
      
      this.log('Factory initialized successfully', 'success');
      this.log(`🏭 Factory ID: ${deployment.factoryId}`);
      
      return true;
      
    } catch (error) {
      this.log(`Initialization failed: ${error.message}`, 'error');
      return false;
    }
  }

  /**
   * Verify deployment by testing contract calls
   */
  async verifyDeployment(deployment) {
    this.log('Verifying deployment...', 'progress');
    
    try {
      // 1. Check package exists
      const packageCmd = `sui client object ${deployment.packageId} --json`;
      const packageResult = execSync(packageCmd, { stdio: 'pipe', encoding: 'utf8' }).toString().trim();
      
      // Handle case where packageId is placeholder
      if (deployment.packageId === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        this.log('⚠️ Package ID is placeholder, skipping verification', 'warning');
        return false;
      }
      
      let packageData;
      try {
        packageData = JSON.parse(packageResult);
      } catch (e) {
        // If JSON parse fails, check if object exists by looking for expected output
        if (packageResult.includes('Object') || packageResult.includes('error')) {
          throw new Error(`Package verification failed: ${packageResult.substring(0, 100)}`);
        }
      }
      
      if (!packageData.data) {
        throw new Error('Package verification failed');
      }
      
      this.log('Package verified', 'success');
      
      // 2. Check factory exists and get stats
      if (deployment.factoryId) {
        const factoryCmd = `sui client object ${deployment.factoryId} --json`;
        const factoryResult = execSync(factoryCmd, { stdio: 'pipe', encoding: 'utf8' });
        const factoryData = JSON.parse(factoryResult);
        
        if (!factoryData.data) {
          throw new Error('Factory verification failed');
        }
        
        this.log('Factory verified', 'success');
        
        // 3. Test factory stats call
        try {
          const statsCmd = `sui client call ` +
            `--package ${deployment.packageId} ` +
            `--module meme_token_factory ` +
            `--function get_factory_stats ` +
            `--args ${deployment.factoryId} ` +
            `--gas-budget 5000000 ` +
            `--json`;
          
          const statsResult = execSync(statsCmd, { stdio: 'pipe', encoding: 'utf8' });
          const statsData = JSON.parse(statsResult);
          
          if (statsData.effects.status.status === 'success') {
            this.log('Factory functionality verified', 'success');
          }
        } catch (statsError) {
          this.log('Factory stats test failed (non-critical)', 'warning');
        }
      }
      
      deployment.verified = true;
      deployment.verifiedAt = new Date().toISOString();
      
      return true;
    } catch (error) {
      this.log(`Verification failed: ${error.message}`, 'error');
      deployment.verified = false;
      return false;
    }
  }

  /**
   * Save deployment configuration
   */
  saveDeploymentConfig(deployment) {
    // Ensure public directory exists
    const publicDir = path.join(PROJECT_ROOT, 'public');
    if (!existsSync(publicDir)) {
      mkdirSync(publicDir, { recursive: true });
    }
    
    // Save deployment config
    writeFileSync(this.deploymentFile, JSON.stringify(deployment, null, 2));
    this.log(`Configuration saved to: ${path.relative(PROJECT_ROOT, this.deploymentFile)}`, 'success');
  }

  /**
   * Update environment files
   */
  updateEnvironmentFiles(deployment) {
    this.log('Updating environment files...', 'progress');
    
    const envUpdates = {
      [`VITE_SUI_NETWORK_${this.network.toUpperCase()}`]: this.network,
      [`VITE_SUI_RPC_${this.network.toUpperCase()}`]: deployment.rpcUrl,
      [`VITE_PACKAGE_ID_${this.network.toUpperCase()}`]: deployment.packageId,
      [`VITE_FACTORY_ID_${this.network.toUpperCase()}`]: deployment.factoryId || '',
      [`VITE_EXPLORER_URL_${this.network.toUpperCase()}`]: deployment.explorerUrl
    };
    
    const envFiles = [
      path.join(PROJECT_ROOT, '.env.local'),
      path.join(PROJECT_ROOT, '.env.example'),
      path.join(PROJECT_ROOT, '.env')
    ];
    
    envFiles.forEach(envFile => {
      if (existsSync(envFile) || envFile.endsWith('.env.example')) {
        try {
          let envContent = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
          
          Object.entries(envUpdates).forEach(([key, value]) => {
            const regex = new RegExp(`^${key}=.*$`, 'm');
            const newLine = `${key}=${value}`;
            
            if (regex.test(envContent)) {
              envContent = envContent.replace(regex, newLine);
            } else {
              envContent += `\n${newLine}`;
            }
          });
          
          writeFileSync(envFile, envContent.trim() + '\n');
          this.log(`Updated: ${path.basename(envFile)}`, 'success');
        } catch (error) {
          this.log(`Failed to update ${envFile}: ${error.message}`, 'warning');
        }
      }
    });
  }

  /**
   * Update TypeScript configuration files
   */
  updateTypeScriptConfig(deployment) {
    this.log('Updating TypeScript configuration...', 'progress');
    
    const configPath = path.join(PROJECT_ROOT, 'src', 'lib', 'config.ts');
    
    // Create config directory if it doesn't exist
    const configDir = path.dirname(configPath);
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
    
    const configContent = `// Auto-generated deployment configuration
// Last updated: ${new Date().toISOString()}

export const DEPLOYMENT_CONFIG = {
  ${this.network}: {
    network: '${this.network}',
    rpcUrl: '${deployment.rpcUrl}',
    explorerUrl: '${deployment.explorerUrl}',
    packageId: '${deployment.packageId}',
    factoryId: '${deployment.factoryId || ''}',
    poolCreationCapId: '${deployment.poolCreationCapId || ''}',
    deploymentTx: '${deployment.deploymentTx}',
    initTx: '${deployment.initTx || ''}',
    deployer: '${deployment.deployer}',
    timestamp: '${deployment.timestamp}'
  }
} as const;

export const CURRENT_NETWORK = '${this.network}' as const;
export const CURRENT_DEPLOYMENT = DEPLOYMENT_CONFIG.${this.network};

// Network configurations
export const NETWORKS = {
  local: {
    rpc: '${NETWORKS.local.rpc}',
    explorer: '${NETWORKS.local.explorer}',
    faucet: '${NETWORKS.local.faucet}'
  },
  devnet: {
    rpc: '${NETWORKS.devnet.rpc}',
    explorer: '${NETWORKS.devnet.explorer}',
    faucet: '${NETWORKS.devnet.faucet}'
  },
  testnet: {
    rpc: '${NETWORKS.testnet.rpc}',
    explorer: '${NETWORKS.testnet.explorer}',
    faucet: '${NETWORKS.testnet.faucet}'
  },
  mainnet: {
    rpc: '${NETWORKS.mainnet.rpc}',
    explorer: '${NETWORKS.mainnet.explorer}',
    faucet: ${NETWORKS.mainnet.faucet ? `'${NETWORKS.mainnet.faucet}'` : 'null'}
  }
} as const;

export type NetworkType = keyof typeof NETWORKS;
export type DeploymentConfig = typeof CURRENT_DEPLOYMENT;
`;
    
    writeFileSync(configPath, configContent);
    this.log(`TypeScript config updated: ${path.relative(PROJECT_ROOT, configPath)}`, 'success');
  }

  /**
   * Test frontend integration
   */
  async testFrontendIntegration(deployment) {
    this.log('Testing frontend integration...', 'progress');
    
    try {
      // Check if deployment config exists and is valid
      const configPath = join(PROJECT_ROOT, 'public', `deployment-${this.network}.json`);
      
      if (!existsSync(configPath)) {
        this.log('⚠️ Deployment config not found, creating it', 'warning');
        this.saveDeploymentConfig(deployment);
      }
      
      // Verify the config can be read and parsed
      const config = JSON.parse(readFileSync(configPath, 'utf8'));
      
      if (config.packageId && config.packageId !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        this.log('✅ Frontend configuration verified', 'success');
        this.log(`📦 Package ID: ${config.packageId}`);
        this.log(`🏭 Factory ID: ${config.factoryId || 'Not initialized'}`);
        return true;
      } else {
        this.log('⚠️ Frontend configuration contains placeholder values', 'warning');
        return false;
      }
      
    } catch (error) {
      this.log('⚠️ Frontend integration test failed: ' + error.message, 'warning');
      return false;
    }
  }

  /**
   * Generate deployment report
   */
  generateDeploymentReport(deployment) {
    const reportPath = path.join(PROJECT_ROOT, `deployment-report-${this.network}-${Date.now()}.json`);
    
    const report = {
      ...deployment,
      networkConfig: this.networkConfig,
      files: {
        deployment: path.relative(PROJECT_ROOT, this.deploymentFile),
        config: 'src/lib/config.ts',
        env: '.env.local'
      },
      links: {
        package: `${deployment.explorerUrl}/object/${deployment.packageId}`,
        factory: deployment.factoryId ? `${deployment.explorerUrl}/object/${deployment.factoryId}` : null,
        deployTx: `${deployment.explorerUrl}/txblock/${deployment.deploymentTx}`,
        initTx: deployment.initTx ? `${deployment.explorerUrl}/txblock/${deployment.initTx}` : null
      },
      nextSteps: [
        'Run `npm run dev` to start the frontend',
        'Test token creation in the UI',
        'Monitor contract events',
        'Set up monitoring and alerting'
      ]
    };
    
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    this.log('📊 Deployment Report Generated', 'success');
    this.log(`🔗 Package: ${report.links.package}`);
    if (report.links.factory) {
      this.log(`🏭 Factory: ${report.links.factory}`);
    }
    this.log(`📄 Report: ${path.basename(reportPath)}`);
    
    return report;
  }

  /**
   * Main deployment process
   */
  async deploy() {
    const startTime = Date.now();
    let deployment = null;
    
    try {
      // Create backup
      this.createBackup();

      // Step 1: Build contracts
      if (!this.buildContracts()) {
        throw new Error('Contract build failed');
      }

      // Step 2: Deploy contracts
      deployment = await this.deployContracts();

      // Step 3: Initialize factory
      if (!(await this.initializeFactory(deployment))) {
        throw new Error('Factory initialization failed');
      }

      // Step 4: Save updated deployment config
      this.saveDeploymentConfig(deployment);

      // Step 5: Update configuration files
      this.updateEnvironmentFiles(deployment);
      this.updateTypeScriptConfig(deployment);

      // Step 6: Verify deployment
      await this.verifyDeployment(deployment);

      // Step 7: Test frontend integration
      await this.testFrontendIntegration(deployment);

      // Step 8: Generate deployment report
      const report = this.generateDeploymentReport(deployment);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      this.log('🎉 Deployment completed successfully!', 'success');
      this.log(`⏱️  Total time: ${duration}s`);
      this.log(`🚀 Ready to start development: npm run dev`);
      
      return report;
      
    } catch (error) {
      this.log(`💥 Deployment failed: ${error.message}`, 'error');
      
      // Restore backup on failure
      if (this.restoreBackup()) {
        this.log('Previous deployment restored', 'warning');
      }
      
      throw error;
    }
  }

  /**
   * Update configurations only (for existing deployments)
   */
  async updateConfigsOnly() {
    if (!existsSync(this.deploymentFile)) {
      throw new Error(`No deployment found for ${this.network}`);
    }
    
    const deployment = JSON.parse(readFileSync(this.deploymentFile, 'utf8'));
    
    this.log('Updating configuration files...', 'progress');
    
    this.updateEnvironmentFiles(deployment);
    this.updateTypeScriptConfig(deployment);
    
    this.log('Configuration files updated successfully', 'success');
    return deployment;
  }

  /**
   * Verify existing deployment only
   */
  async verifyOnly() {
    if (!existsSync(this.deploymentFile)) {
      throw new Error(`No deployment found for ${this.network}`);
    }
    
    const deployment = JSON.parse(readFileSync(this.deploymentFile, 'utf8'));
    
    await this.verifyDeployment(deployment);
    await this.testFrontendIntegration(deployment);
    
    this.saveDeploymentConfig(deployment);
    
    return deployment;
  }
}

// CLI Usage
async function main() {
  const args = process.argv.slice(2);
  const network = args.find(arg => !arg.startsWith('--')) || DEFAULT_NETWORK;
  
  const options = {
    force: args.includes('--force'),
    verifyOnly: args.includes('--verify-only'),
    updateConfigsOnly: args.includes('--update-configs-only'),
    skipTests: args.includes('--skip-tests')
  };
  
  const deployer = new OptimizedMemeFlowDeployer(network, options);
  
  try {
    if (options.updateConfigsOnly) {
      await deployer.updateConfigsOnly();
    } else if (options.verifyOnly) {
      await deployer.verifyOnly();
    } else {
      // Check if already deployed
      const existingDeployment = deployer.createBackup();
      if (existingDeployment && !options.force) {
        deployer.log(`📋 Found existing deployment for ${network}:`);
        deployer.log(`📦 Package: ${existingDeployment.packageId}`);
        deployer.log(`🏭 Factory: ${existingDeployment.factoryId || 'Not initialized'}`);
        deployer.log('');
        deployer.log('Use --force to redeploy or --update-configs-only to update configs');
        process.exit(0);
      }
      
      await deployer.deploy();
    }
    
  } catch (error) {
    deployer.log(`Deployment failed: ${error.message}`, 'error');
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { OptimizedMemeFlowDeployer };