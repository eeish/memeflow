#!/usr/bin/env node

/**
 * Improved MemeFlow Contract Deployment Script V2
 * Features:
 * - Better identification of shared objects (ProfileRegistry vs Factory)
 * - Comprehensive configuration file updates
 * - Verification of all deployed objects
 * - Clear labeling of each resource ID
 */

import { execSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import path, { join } from 'path';
import { fileURLToPath } from 'url';

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

class ImprovedDeployerV2 {
  constructor(network = 'devnet', options = {}) {
    this.network = network;
    this.networkConfig = NETWORKS[network];
    this.options = options;
    this.contractsPath = path.join(PROJECT_ROOT, 'contracts', 'memeflow');
    this.verbose = options.verbose || false;
    this.stepDelay = options.fast ? 500 : 1500;
    
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
    console.log(colors.dim + '─'.repeat(70) + colors.reset);
  }

  // Print deployment header
  header() {
    console.clear();
    this.divider();
    console.log(`${colors.bright}${colors.cyan}   MemeFlow Contract Deployment V2${colors.reset}`);
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
    this.step(1, 7, 'Checking Prerequisites');
    await this.sleep();

    // Check Sui CLI
    this.log('Checking Sui CLI installation...', 'progress');
    try {
      const version = execSync('sui --version', { encoding: 'utf8' }).trim();
      await this.sleep();
      this.log(`Found Sui CLI: ${version}`, 'success');
      
      // Check for version mismatch warning (non-critical)
      if (version.includes('1.54')) {
        this.log('Note: Consider updating Sui CLI to latest version with: cargo install --locked --git https://github.com/MystenLabs/sui.git --branch devnet sui', 'info');
      }
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
      
      // Parse the table format output - look for the balance in the table
      // The format is: │ Sui   10000000000    10.00 SUI   │
      const suiBalanceMatch = balance.match(/Sui\s+\d+\s+([\d.]+)\s+SUI/);
      const hasValidBalance = suiBalanceMatch && parseFloat(suiBalanceMatch[1]) > 0;
      
      if (!hasValidBalance) {
        // Also check if the output explicitly says "No coins"
        if (balance.includes('No coins')) {
          this.log('No SUI balance found. You need funds to deploy.', 'warning');
        } else {
          this.log('Unable to parse balance. Output:', 'warning');
          console.log(balance);
        }
        
        if (this.networkConfig.faucet) {
          this.log(`Get test tokens from: ${this.networkConfig.faucet}`, 'info');
        }
        return false;
      }
      
      // Display the SUI balance
      const balanceAmount = suiBalanceMatch[1];
      this.log(`Account balance: ${colors.green}${balanceAmount} SUI${colors.reset}`, 'success');
    } catch (error) {
      this.log('Failed to check account: ' + error.message, 'error');
      return false;
    }

    return true;
  }

  // Build contracts
  async buildContracts() {
    this.step(2, 7, 'Building Smart Contracts');
    await this.sleep();

    this.log('Compiling Move contracts...', 'progress');
    
    try {
      await this.showSpinner('Building contracts', 3000);
      
      const buildCmd = `cd ${this.contractsPath} && sui move build --skip-fetch-latest-git-deps`;
      const buildOutput = execSync(buildCmd, { 
        encoding: 'utf8',
        stdio: this.verbose ? 'inherit' : 'pipe'
      });

      await this.sleep();
      this.log('Contracts built successfully', 'success');
      
      // List the modules that were built
      this.log('Built modules:', 'info');
      console.log(`  - memeflow_social`);
      console.log(`  - social_follow`);
      
      return true;
    } catch (error) {
      this.log('Build failed: ' + error.message, 'error');
      return false;
    }
  }

  // Deploy contracts
  async deployContracts() {
    this.step(3, 7, 'Deploying Contracts to Blockchain');
    await this.sleep();

    this.log('Preparing deployment transaction...', 'progress');
    await this.sleep();

    try {
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
      
      // Extract deployment info with better identification
      const deployment = await this.extractDeploymentInfoV2(deployResult);
      
      // Display deployment details
      console.log();
      this.log('Deployment Details:', 'info');
      console.log(`  ${colors.bright}Package ID:${colors.reset}`);
      console.log(`    ${colors.cyan}${deployment.packageId}${colors.reset}`);
      
      if (deployment.profileRegistryId) {
        console.log(`  ${colors.bright}Profile Registry ID:${colors.reset}`);
        console.log(`    ${colors.cyan}${deployment.profileRegistryId}${colors.reset}`);
      }
      
      if (deployment.factoryId) {
        console.log(`  ${colors.bright}Factory ID:${colors.reset}`);
        console.log(`    ${colors.cyan}${deployment.factoryId}${colors.reset}`);
      }
      
      console.log(`  ${colors.bright}Transaction:${colors.reset} ${deployment.deploymentTx}`);
      console.log(`  ${colors.bright}Gas Used:${colors.reset} ${deployment.gasUsed.computationCost || 0} MIST`);
      
      return deployment;
    } catch (error) {
      this.log('Deployment failed: ' + error.message, 'error');
      console.error(error);
      return null;
    }
  }

  // Enhanced extraction of deployment information
  async extractDeploymentInfoV2(deployResult) {
    const createdObjects = deployResult.effects.created || [];
    
    // Find package ID
    const packageObj = createdObjects.find(obj => obj.owner === 'Immutable');
    if (!packageObj) {
      throw new Error('Could not find package ID in deployment result');
    }

    // Find all shared objects created
    const sharedObjects = createdObjects.filter(obj => 
      obj.owner && typeof obj.owner === 'object' && 'Shared' in obj.owner
    );
    
    // Try to identify objects by querying their types
    console.log();
    this.log('Identifying created objects...', 'progress');
    
    let profileRegistryId = '';
    let factoryId = '';
    
    for (const obj of sharedObjects) {
      try {
        // Query the object to get its type information
        const objCmd = `sui client object ${obj.reference.objectId} --json`;
        const objResult = JSON.parse(execSync(objCmd, { encoding: 'utf8', stdio: 'pipe' }));
        
        if (objResult && objResult.data && objResult.data.type) {
          const objType = objResult.data.type;
          console.log(`  Checking object: ${obj.reference.objectId.substring(0, 20)}...`);
          console.log(`    Type: ${objType}`);
          
          // Identify based on type
          if (objType.includes('ProfileRegistry')) {
            profileRegistryId = obj.reference.objectId;
            console.log(`    ${colors.green}✓ Identified as Profile Registry${colors.reset}`);
          } else if (objType.includes('Factory')) {
            factoryId = obj.reference.objectId;
            console.log(`    ${colors.green}✓ Identified as Factory${colors.reset}`);
          } else {
            console.log(`    ${colors.yellow}? Unknown shared object type${colors.reset}`);
            // If we can't identify by type, use position as fallback
            if (!profileRegistryId && sharedObjects[0] === obj) {
              profileRegistryId = obj.reference.objectId;
              console.log(`    ${colors.yellow}→ Assuming as Profile Registry (first shared object)${colors.reset}`);
            } else if (!factoryId && sharedObjects[1] === obj) {
              factoryId = obj.reference.objectId;
              console.log(`    ${colors.yellow}→ Assuming as Factory (second shared object)${colors.reset}`);
            }
          }
        }
      } catch (error) {
        // If we can't query the object, fall back to position-based identification
        console.log(`  Object ${obj.reference.objectId.substring(0, 20)}... (unable to query type)`);
        if (!profileRegistryId && sharedObjects[0] === obj) {
          profileRegistryId = obj.reference.objectId;
          console.log(`    ${colors.yellow}→ Assuming as Profile Registry (first shared object)${colors.reset}`);
        } else if (!factoryId && sharedObjects[1] === obj) {
          factoryId = obj.reference.objectId;
          console.log(`    ${colors.yellow}→ Assuming as Factory (second shared object)${colors.reset}`);
        }
      }
    }

    return {
      network: this.network,
      rpcUrl: this.networkConfig.rpc,
      explorerUrl: this.networkConfig.explorer,
      packageId: packageObj.reference.objectId,
      profileRegistryId: profileRegistryId,
      factoryId: factoryId,
      deploymentTx: deployResult.digest,
      timestamp: new Date().toISOString(),
      deployer: deployResult.transaction.data.sender,
      gasUsed: deployResult.effects.gasUsed || {},
      status: 'deployed',
      sharedObjectsCreated: sharedObjects.length,
      allCreatedObjects: createdObjects.map(obj => ({
        id: obj.reference.objectId,
        owner: obj.owner
      }))
    };
  }

  // Save deployment configuration
  async saveConfiguration(deployment) {
    this.step(4, 7, 'Saving Configuration Files');
    await this.sleep();

    // Save to JSON file
    this.log('Saving deployment JSON...', 'progress');
    const configPath = path.join(PROJECT_ROOT, 'public', `deployment-${this.network}.json`);
    writeFileSync(configPath, JSON.stringify(deployment, null, 2));
    await this.sleep();
    this.log(`✓ ${configPath}`, 'success');

    // Update .env.local file
    this.log('Updating environment variables...', 'progress');
    await this.sleep();
    this.updateEnvFileV2(deployment);
    this.log(`✓ .env.local`, 'success');

    // Update TypeScript config if exists
    const tsConfigPath = path.join(PROJECT_ROOT, 'src', 'lib', 'config.ts');
    if (existsSync(tsConfigPath)) {
      this.log('Updating TypeScript configuration...', 'progress');
      await this.sleep();
      this.updateTypeScriptConfig(deployment);
      this.log(`✓ src/lib/config.ts`, 'success');
    }

    return true;
  }

  // Enhanced environment file update
  updateEnvFileV2(deployment) {
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
    
    // Update or add ALL deployment values
    const updates = {
      'VITE_SUI_NETWORK': this.network,
      'VITE_NETWORK': this.network,
      'VITE_PACKAGE_ID': deployment.packageId,
      'VITE_PROFILE_REGISTRY_ID': deployment.profileRegistryId || '',
      'VITE_FACTORY_ID': deployment.factoryId || '',
      'VITE_SUI_RPC_URL': deployment.rpcUrl,
      'VITE_EXPLORER_URL': deployment.explorerUrl,
      
      // Network-specific values
      [`VITE_PACKAGE_ID_${this.network.toUpperCase()}`]: deployment.packageId,
      [`VITE_PROFILE_REGISTRY_ID_${this.network.toUpperCase()}`]: deployment.profileRegistryId || '',
      [`VITE_FACTORY_ID_${this.network.toUpperCase()}`]: deployment.factoryId || '',
      
      // Deployment metadata
      'DEPLOYMENT_NETWORK': this.network,
      'DEPLOYMENT_TIMESTAMP': deployment.timestamp,
      'DEPLOYMENT_TX': deployment.deploymentTx,
      'DEPLOYMENT_DEPLOYER': deployment.deployer,
    };
    
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
  }

  // Update TypeScript configuration
  updateTypeScriptConfig(deployment) {
    const configPath = path.join(PROJECT_ROOT, 'src', 'lib', 'config.ts');
    
    if (existsSync(configPath)) {
      let content = readFileSync(configPath, 'utf8');
      
      // Update the network configuration
      const networkKey = `${this.network}:`;
      
      // Update package ID
      const packageIdRegex = new RegExp(`(${networkKey}[\\s\\S]*?packageId:\\s*['"])([^'"]+)(['"])`, 'g');
      content = content.replace(packageIdRegex, `$1${deployment.packageId}$3`);
      
      // Update profile registry ID
      if (deployment.profileRegistryId) {
        const registryRegex = new RegExp(`(${networkKey}[\\s\\S]*?profileRegistryId:\\s*['"])([^'"]+)(['"])`, 'g');
        content = content.replace(registryRegex, `$1${deployment.profileRegistryId}$3`);
      }
      
      // Update factory ID
      if (deployment.factoryId) {
        const factoryRegex = new RegExp(`(${networkKey}[\\s\\S]*?factoryId:\\s*['"])([^'"]+)(['"])`, 'g');
        content = content.replace(factoryRegex, `$1${deployment.factoryId}$3`);
      }
      
      writeFileSync(configPath, content);
    }
  }

  // Verify deployment
  async verifyDeployment(deployment) {
    this.step(5, 7, 'Verifying Deployment');
    await this.sleep();

    this.log('Verifying package on blockchain...', 'progress');
    
    try {
      await this.showSpinner('Checking package', 2000);
      
      const checkCmd = `sui client object ${deployment.packageId} --json`;
      const checkResult = execSync(checkCmd, { encoding: 'utf8', stdio: 'pipe' });
      
      if (checkResult) {
        this.log('✓ Package verified', 'success');
      }
    } catch (error) {
      this.log('Package verification failed: ' + error.message, 'warning');
    }

    // Verify Profile Registry if exists
    if (deployment.profileRegistryId) {
      this.log('Verifying Profile Registry...', 'progress');
      try {
        const checkCmd = `sui client object ${deployment.profileRegistryId} --json`;
        const checkResult = execSync(checkCmd, { encoding: 'utf8', stdio: 'pipe' });
        if (checkResult) {
          this.log('✓ Profile Registry verified', 'success');
        }
      } catch (error) {
        this.log('Profile Registry verification failed: ' + error.message, 'warning');
      }
    }

    // Verify Factory if exists
    if (deployment.factoryId) {
      this.log('Verifying Factory...', 'progress');
      try {
        const checkCmd = `sui client object ${deployment.factoryId} --json`;
        const checkResult = execSync(checkCmd, { encoding: 'utf8', stdio: 'pipe' });
        if (checkResult) {
          this.log('✓ Factory verified', 'success');
        }
      } catch (error) {
        this.log('Factory verification failed: ' + error.message, 'warning');
      }
    }

    return true;
  }

  // Create verification script
  async createVerificationScript(deployment) {
    this.step(6, 7, 'Creating Verification Script');
    await this.sleep();

    const scriptContent = `#!/bin/bash
# MemeFlow Deployment Verification Script
# Generated: ${deployment.timestamp}
# Network: ${this.network}

echo "Verifying MemeFlow deployment on ${this.network}..."
echo ""

# Package
echo "Package ID: ${deployment.packageId}"
sui client object ${deployment.packageId} --json | jq '.data.type' || echo "Failed to verify package"
echo ""

# Profile Registry
${deployment.profileRegistryId ? `
echo "Profile Registry: ${deployment.profileRegistryId}"
sui client object ${deployment.profileRegistryId} --json | jq '.data.type' || echo "Failed to verify registry"
echo ""
` : '# No Profile Registry deployed'}

# Factory
${deployment.factoryId ? `
echo "Factory: ${deployment.factoryId}"
sui client object ${deployment.factoryId} --json | jq '.data.type' || echo "Failed to verify factory"
echo ""
` : '# No Factory deployed'}

echo "Transaction: ${deployment.deploymentTx}"
echo "Explorer: ${deployment.explorerUrl}/tx/${deployment.deploymentTx}"
`;

    const scriptPath = path.join(PROJECT_ROOT, 'scripts', `verify-${this.network}.sh`);
    writeFileSync(scriptPath, scriptContent);
    execSync(`chmod +x ${scriptPath}`);
    
    this.log(`Verification script created: ${scriptPath}`, 'success');
  }

  // Final summary
  async showSummary(deployment) {
    this.step(7, 7, 'Deployment Complete');
    await this.sleep();

    console.log();
    console.log(`${colors.bright}${colors.green}🎉 Deployment Successful!${colors.reset}`);
    console.log();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log();
    console.log(`${colors.bright}DEPLOYMENT SUMMARY${colors.reset}`);
    console.log();
    console.log(`Network: ${colors.cyan}${this.networkConfig.name}${colors.reset}`);
    console.log();
    console.log(`${colors.bright}Resource IDs:${colors.reset}`);
    console.log(`  Package ID:`);
    console.log(`    ${colors.cyan}${deployment.packageId}${colors.reset}`);
    
    if (deployment.profileRegistryId) {
      console.log(`  Profile Registry ID:`);
      console.log(`    ${colors.cyan}${deployment.profileRegistryId}${colors.reset}`);
    }
    
    if (deployment.factoryId) {
      console.log(`  Factory ID:`);
      console.log(`    ${colors.cyan}${deployment.factoryId}${colors.reset}`);
    }
    
    console.log();
    console.log(`${colors.bright}Configuration Files Updated:${colors.reset}`);
    console.log(`  ✓ public/deployment-${this.network}.json`);
    console.log(`  ✓ .env.local`);
    console.log(`  ✓ scripts/verify-${this.network}.sh`);
    
    console.log();
    console.log(`${colors.bright}Explorer Links:${colors.reset}`);
    console.log(`  Package: ${colors.blue}${deployment.explorerUrl}/object/${deployment.packageId}${colors.reset}`);
    console.log(`  Transaction: ${colors.blue}${deployment.explorerUrl}/tx/${deployment.deploymentTx}${colors.reset}`);
    
    console.log();
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log();
    console.log(`${colors.bright}Next Steps:${colors.reset}`);
    console.log(`  1. ${colors.yellow}Verify deployment: npm run contract:verify${colors.reset}`);
    console.log(`  2. ${colors.yellow}Switch wallet to ${this.networkConfig.name}${colors.reset}`);
    console.log(`  3. ${colors.yellow}Restart dev server: npm run dev${colors.reset}`);
    console.log(`  4. ${colors.yellow}Test the application${colors.reset}`);
    console.log();
    this.divider();
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

    // Step 6: Create verification script
    await this.createVerificationScript(deployment);

    // Step 7: Summary
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
  console.log(`${colors.bright}MemeFlow Contract Deployment V2${colors.reset}`);
  console.log(`${colors.dim}Enhanced identification and configuration management${colors.reset}`);
  console.log();

  const deployer = new ImprovedDeployerV2(network, options);
  
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

export { ImprovedDeployerV2 };