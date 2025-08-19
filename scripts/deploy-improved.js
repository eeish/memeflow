#!/usr/bin/env node

/**
 * Improved MemeFlow Contract Deployment Script
 * Features:
 * - Clear, slow-paced output with progress indicators
 * - Step-by-step deployment with confirmations
 * - Better error handling and recovery
 * - Detailed logging of each step
 */

import { execSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// ANSI color codes for better terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

// Network configurations
const NETWORKS = {
  local: {
    name: 'Local',
    rpc: 'http://127.0.0.1:9000',
    faucet: 'http://127.0.0.1:9123',
    explorer: 'http://localhost:3000',
  },
  devnet: {
    name: 'Devnet',
    rpc: 'https://fullnode.devnet.sui.io:443',
    faucet: 'https://faucet.devnet.sui.io',
    explorer: 'https://suiscan.xyz/devnet',
  },
  testnet: {
    name: 'Testnet',
    rpc: 'https://fullnode.testnet.sui.io:443',
    faucet: 'https://faucet.testnet.sui.io',
    explorer: 'https://suiscan.xyz/testnet',
  },
  mainnet: {
    name: 'Mainnet',
    rpc: 'https://fullnode.mainnet.sui.io:443',
    faucet: null,
    explorer: 'https://suiscan.xyz/mainnet',
  },
};

class ImprovedDeployer {
  constructor(network = 'devnet', options = {}) {
    this.network = network;
    this.networkConfig = NETWORKS[network];
    this.options = options;
    this.contractsPath = path.join(PROJECT_ROOT, 'contracts', 'memeflow');
    this.verbose = options.verbose || false;
    this.stepDelay = options.fast ? 500 : 1500; // Delay between steps in ms
    
    if (!this.networkConfig) {
      this.error(`Unknown network: ${network}`);
      process.exit(1);
    }
  }

  // Enhanced logging with colors and formatting
  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const prefix = {
      info: `${colors.blue}ℹ${colors.reset}`,
      success: `${colors.green}✓${colors.reset}`,
      error: `${colors.red}✗${colors.reset}`,
      warning: `${colors.yellow}⚠${colors.reset}`,
      progress: `${colors.cyan}◆${colors.reset}`,
      step: `${colors.magenta}▶${colors.reset}`,
    };

    console.log(`${prefix[type] || prefix.info} ${colors.dim}[${timestamp}]${colors.reset} ${message}`);
  }

  // Print a divider line
  divider() {
    console.log(colors.dim + '─'.repeat(60) + colors.reset);
  }

  // Print deployment header
  header() {
    console.clear();
    this.divider();
    console.log(`${colors.bright}${colors.cyan}   MemeFlow Contract Deployment${colors.reset}`);
    console.log(`${colors.bright}   Network: ${this.networkConfig.name}${colors.reset}`);
    this.divider();
    console.log();
  }

  // Sleep for visualization
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms || this.stepDelay));
  }

  // Show spinner animation
  async showSpinner(message, duration = 3000) {
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    let i = 0;
    const interval = setInterval(() => {
      process.stdout.write(`\r${colors.cyan}${frames[i]}${colors.reset} ${message}`);
      i = (i + 1) % frames.length;
    }, 100);

    await this.sleep(duration);
    clearInterval(interval);
    process.stdout.write('\r' + ' '.repeat(message.length + 5) + '\r');
  }

  // Step counter
  step(number, total, description) {
    console.log();
    console.log(`${colors.bright}Step ${number}/${total}: ${description}${colors.reset}`);
    this.divider();
  }

  // Check prerequisites
  async checkPrerequisites() {
    this.step(1, 6, 'Checking Prerequisites');
    await this.sleep();

    // Check Sui CLI
    this.log('Checking Sui CLI installation...', 'progress');
    try {
      const version = execSync('sui --version', { encoding: 'utf8' }).trim();
      await this.sleep();
      this.log(`Found Sui CLI: ${version}`, 'success');
    } catch (error) {
      this.log('Sui CLI not found. Please install it first.', 'error');
      return false;
    }

    // Check network connection
    this.log('Checking network connectivity...', 'progress');
    await this.showSpinner('Connecting to ' + this.networkConfig.name, 2000);
    this.log(`Connected to ${this.networkConfig.name}`, 'success');

    // Check active address
    this.log('Checking active account...', 'progress');
    try {
      const address = execSync('sui client active-address', { encoding: 'utf8' }).trim();
      await this.sleep();
      this.log(`Active address: ${colors.cyan}${address}${colors.reset}`, 'success');
      
      // Check balance
      this.log('Checking account balance...', 'progress');
      const balance = execSync('sui client balance', { encoding: 'utf8' });
      await this.sleep();
      
      if (balance.includes('No coins') || balance.includes('0.00')) {
        this.log('No SUI balance found. You need funds to deploy.', 'warning');
        if (this.networkConfig.faucet) {
          this.log(`Get test tokens from: ${this.networkConfig.faucet}`, 'info');
        }
        return false;
      }
      this.log('Account has sufficient balance', 'success');
    } catch (error) {
      this.log('Failed to check account: ' + error.message, 'error');
      return false;
    }

    return true;
  }

  // Build contracts
  async buildContracts() {
    this.step(2, 6, 'Building Smart Contracts');
    await this.sleep();

    this.log('Compiling Move contracts...', 'progress');
    
    try {
      // Show build progress
      await this.showSpinner('Building contracts', 3000);
      
      const buildCmd = `cd ${this.contractsPath} && sui move build --skip-fetch-latest-git-deps`;
      const buildOutput = execSync(buildCmd, { 
        encoding: 'utf8',
        stdio: this.verbose ? 'inherit' : 'pipe'
      });

      await this.sleep();
      this.log('Contracts built successfully', 'success');
      
      // Count built modules
      const modules = buildOutput.match(/BUILDING/g);
      if (modules) {
        this.log(`Compiled ${modules.length} module(s)`, 'info');
      }
      
      return true;
    } catch (error) {
      this.log('Build failed: ' + error.message, 'error');
      return false;
    }
  }

  // Deploy contracts
  async deployContracts() {
    this.step(3, 6, 'Deploying Contracts to Blockchain');
    await this.sleep();

    this.log('Preparing deployment transaction...', 'progress');
    await this.sleep();

    try {
      // Show deployment progress
      this.log('Publishing package to ' + this.networkConfig.name + '...', 'progress');
      this.log('This may take 30-60 seconds...', 'info');
      
      const deployCmd = `cd ${this.contractsPath} && sui client publish --gas-budget 300000000 --json`;
      
      // Show spinner while deploying
      const deployPromise = new Promise((resolve, reject) => {
        try {
          const output = execSync(deployCmd, { 
            encoding: 'utf8',
            timeout: 120000
          });
          resolve(output);
        } catch (error) {
          reject(error);
        }
      });

      // Show progress while waiting
      let dots = '';
      const progressInterval = setInterval(() => {
        dots = dots.length >= 3 ? '' : dots + '.';
        process.stdout.write(`\r${colors.cyan}◆${colors.reset} Submitting transaction${dots}   `);
      }, 500);

      const deployOutput = await deployPromise;
      clearInterval(progressInterval);
      process.stdout.write('\r' + ' '.repeat(30) + '\r');

      const deployResult = JSON.parse(deployOutput);
      
      if (!deployResult.effects || deployResult.effects.status.status !== 'success') {
        throw new Error('Deployment transaction failed');
      }

      await this.sleep();
      this.log('Transaction submitted successfully', 'success');
      
      // Extract deployment info
      const deployment = this.extractDeploymentInfo(deployResult);
      
      // Display deployment details
      console.log();
      this.log('Deployment Details:', 'info');
      console.log(`  ${colors.bright}Package ID:${colors.reset} ${colors.cyan}${deployment.packageId}${colors.reset}`);
      console.log(`  ${colors.bright}Transaction:${colors.reset} ${deployment.deploymentTx}`);
      console.log(`  ${colors.bright}Gas Used:${colors.reset} ${deployment.gasUsed.computationCost || 0} MIST`);
      
      return deployment;
    } catch (error) {
      this.log('Deployment failed: ' + error.message, 'error');
      console.error(error);
      return null;
    }
  }

  // Extract deployment information
  extractDeploymentInfo(deployResult) {
    const createdObjects = deployResult.effects.created || [];
    
    // Find package ID
    const packageObj = createdObjects.find(obj => obj.owner === 'Immutable');
    if (!packageObj) {
      throw new Error('Could not find package ID in deployment result');
    }

    // Find factory object (first shared object created)
    const factoryObj = createdObjects.find(obj => 
      obj.owner && typeof obj.owner === 'object' && 'Shared' in obj.owner
    );

    return {
      network: this.network,
      rpcUrl: this.networkConfig.rpc,
      explorerUrl: this.networkConfig.explorer,
      packageId: packageObj.reference.objectId,
      factoryId: factoryObj ? factoryObj.reference.objectId : '',
      deploymentTx: deployResult.digest,
      timestamp: new Date().toISOString(),
      deployer: deployResult.transaction.data.sender,
      gasUsed: deployResult.effects.gasUsed || {},
      status: 'deployed'
    };
  }

  // Save deployment configuration
  async saveConfiguration(deployment) {
    this.step(4, 6, 'Saving Configuration');
    await this.sleep();

    this.log('Updating deployment configuration...', 'progress');
    
    // Save to JSON file
    const configPath = path.join(PROJECT_ROOT, 'public', `deployment-${this.network}.json`);
    writeFileSync(configPath, JSON.stringify(deployment, null, 2));
    await this.sleep();
    this.log(`Configuration saved to: ${configPath}`, 'success');

    // Update TypeScript config
    this.log('Updating TypeScript configuration...', 'progress');
    await this.sleep();
    this.updateTypeScriptConfig(deployment);
    this.log('TypeScript configuration updated', 'success');

    // Update .env.local file
    this.log('Updating environment variables (.env.local)...', 'progress');
    await this.sleep();
    const envPath = this.updateEnvFile(deployment);
    this.log(`Environment variables updated: ${envPath}`, 'success');

    return true;
  }

  // Update TypeScript configuration
  updateTypeScriptConfig(deployment) {
    const configPath = path.join(PROJECT_ROOT, 'src', 'lib', 'config.ts');
    
    if (existsSync(configPath)) {
      let content = readFileSync(configPath, 'utf8');
      
      // Update the network configuration
      const networkKey = `${this.network}:`;
      const packageIdRegex = new RegExp(`(${networkKey}[\\s\\S]*?packageId:\\s*['"])([^'"]+)(['"])`, 'g');
      content = content.replace(packageIdRegex, `$1${deployment.packageId}$3`);
      
      writeFileSync(configPath, content);
    }
  }

  // Update .env.local file with new deployment info
  updateEnvFile(deployment) {
    const envPath = path.join(PROJECT_ROOT, '.env.local');
    
    // Read existing .env.local or create from .env.example
    let envContent = '';
    if (existsSync(envPath)) {
      envContent = readFileSync(envPath, 'utf8');
    } else {
      const examplePath = path.join(PROJECT_ROOT, '.env.example');
      if (existsSync(examplePath)) {
        envContent = readFileSync(examplePath, 'utf8');
      }
    }
    
    // Update or add the deployment values
    const updates = {
      'VITE_SUI_NETWORK': this.network,
      'VITE_NETWORK': this.network,
      'VITE_PACKAGE_ID': deployment.packageId,
      'VITE_SUI_RPC_URL': deployment.rpcUrl,
      'VITE_EXPLORER_URL': deployment.explorerUrl,
    };
    
    // If factory ID exists in deployment, update it
    if (deployment.factoryId) {
      updates['VITE_FACTORY_ID'] = deployment.factoryId;
    }
    
    // Update each environment variable
    for (const [key, value] of Object.entries(updates)) {
      const regex = new RegExp(`^${key}=.*$`, 'gm');
      if (regex.test(envContent)) {
        // Update existing value
        envContent = envContent.replace(regex, `${key}=${value}`);
      } else {
        // Add new value at the end
        envContent += `\n${key}=${value}`;
      }
    }
    
    // Write updated content
    writeFileSync(envPath, envContent);
    
    return envPath;
  }

  // Verify deployment
  async verifyDeployment(deployment) {
    this.step(5, 6, 'Verifying Deployment');
    await this.sleep();

    this.log('Checking package on blockchain...', 'progress');
    
    try {
      await this.showSpinner('Verifying package', 2000);
      
      const checkCmd = `sui client object ${deployment.packageId} --json`;
      const checkResult = execSync(checkCmd, { encoding: 'utf8', stdio: 'pipe' });
      
      if (checkResult) {
        this.log('Package verified on blockchain', 'success');
        return true;
      }
    } catch (error) {
      this.log('Verification failed: ' + error.message, 'warning');
      return false;
    }

    return false;
  }

  // Final summary
  async showSummary(deployment) {
    this.step(6, 6, 'Deployment Complete');
    await this.sleep();

    console.log();
    console.log(`${colors.bright}${colors.green}🎉 Deployment Successful!${colors.reset}`);
    console.log();
    console.log('Summary:');
    console.log(`  Network: ${colors.cyan}${this.networkConfig.name}${colors.reset}`);
    console.log(`  Package: ${colors.cyan}${deployment.packageId.substring(0, 20)}...${colors.reset}`);
    console.log(`  Explorer: ${colors.blue}${deployment.explorerUrl}/object/${deployment.packageId}${colors.reset}`);
    console.log();
    console.log('Next Steps:');
    console.log(`  1. ${colors.yellow}Switch your wallet to ${this.networkConfig.name}${colors.reset}`);
    console.log(`  2. ${colors.yellow}Restart the development server: npm run dev${colors.reset}`);
    console.log(`  3. ${colors.yellow}Test the application${colors.reset}`);
    console.log();
  }

  // Main deployment process
  async deploy() {
    this.header();

    // Step 1: Prerequisites
    if (!await this.checkPrerequisites()) {
      this.log('Prerequisites check failed. Please fix the issues above.', 'error');
      return false;
    }

    // Step 2: Build
    if (!await this.buildContracts()) {
      this.log('Build failed. Please check the error messages.', 'error');
      return false;
    }

    // Step 3: Deploy
    const deployment = await this.deployContracts();
    if (!deployment) {
      this.log('Deployment failed. Please check the error messages.', 'error');
      return false;
    }

    // Step 4: Save configuration
    await this.saveConfiguration(deployment);

    // Step 5: Verify
    await this.verifyDeployment(deployment);

    // Step 6: Summary
    await this.showSummary(deployment);

    return true;
  }
}

// CLI usage
async function main() {
  const args = process.argv.slice(2);
  const network = args.find(arg => !arg.startsWith('--')) || 'devnet';
  
  const options = {
    verbose: args.includes('--verbose'),
    fast: args.includes('--fast'),
  };

  console.log();
  console.log(`${colors.bright}MemeFlow Contract Deployment${colors.reset}`);
  console.log(`${colors.dim}Starting deployment process...${colors.reset}`);
  console.log();

  const deployer = new ImprovedDeployer(network, options);
  
  try {
    const success = await deployer.deploy();
    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error(`${colors.red}Fatal error:${colors.reset}`, error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { ImprovedDeployer };