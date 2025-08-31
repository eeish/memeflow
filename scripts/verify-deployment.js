#!/usr/bin/env node

/**
 * Verify MemeFlow Deployment
 * Checks that all resource IDs in configuration files are valid on-chain
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

async function verifyDeployment(network = 'devnet') {
  console.log(`\n${colors.bright}Verifying MemeFlow Deployment on ${network}${colors.reset}\n`);
  
  // Load deployment configuration
  const configPath = path.join(PROJECT_ROOT, 'public', `deployment-${network}.json`);
  if (!existsSync(configPath)) {
    console.error(`${colors.red}✗ Deployment configuration not found: ${configPath}${colors.reset}`);
    return false;
  }
  
  const deployment = JSON.parse(readFileSync(configPath, 'utf8'));
  console.log('Configuration loaded from:', configPath);
  console.log('─'.repeat(60));
  
  let allValid = true;
  
  // Verify Package ID
  console.log('\n1. Package ID:');
  console.log(`   ${colors.cyan}${deployment.packageId}${colors.reset}`);
  try {
    const result = execSync(`sui client object ${deployment.packageId} --json`, { 
      encoding: 'utf8',
      stdio: 'pipe' 
    });
    const obj = JSON.parse(result);
    console.log(`   ${colors.green}✓ Valid${colors.reset} - Type: ${obj.data.type || 'Package'}`);
  } catch (error) {
    console.log(`   ${colors.red}✗ Not found on chain${colors.reset}`);
    allValid = false;
  }
  
  // Verify Profile Registry ID
  if (deployment.profileRegistryId) {
    console.log('\n2. Profile Registry ID:');
    console.log(`   ${colors.cyan}${deployment.profileRegistryId}${colors.reset}`);
    try {
      const result = execSync(`sui client object ${deployment.profileRegistryId} --json`, { 
        encoding: 'utf8',
        stdio: 'pipe' 
      });
      const obj = JSON.parse(result);
      console.log(`   ${colors.green}✓ Valid${colors.reset} - Type: ${obj.data.type || 'Unknown'}`);
      
      // Check if it's shared
      if (obj.data.owner && obj.data.owner.Shared) {
        console.log(`   ${colors.green}✓ Shared object${colors.reset}`);
      } else {
        console.log(`   ${colors.yellow}⚠ Not a shared object${colors.reset}`);
      }
    } catch (error) {
      console.log(`   ${colors.red}✗ Not found on chain${colors.reset}`);
      allValid = false;
    }
  }
  
  // Verify Factory ID
  if (deployment.factoryId) {
    console.log('\n3. Factory ID:');
    console.log(`   ${colors.cyan}${deployment.factoryId}${colors.reset}`);
    try {
      const result = execSync(`sui client object ${deployment.factoryId} --json`, { 
        encoding: 'utf8',
        stdio: 'pipe' 
      });
      const obj = JSON.parse(result);
      console.log(`   ${colors.green}✓ Valid${colors.reset} - Type: ${obj.data.type || 'Unknown'}`);
      
      // Check if it's shared
      if (obj.data.owner && obj.data.owner.Shared) {
        console.log(`   ${colors.green}✓ Shared object${colors.reset}`);
      } else {
        console.log(`   ${colors.yellow}⚠ Not a shared object${colors.reset}`);
      }
    } catch (error) {
      console.log(`   ${colors.red}✗ Not found on chain${colors.reset}`);
      allValid = false;
    }
  }
  
  // Check .env.local synchronization
  console.log('\n4. Environment Variables (.env.local):');
  const envPath = path.join(PROJECT_ROOT, '.env.local');
  if (existsSync(envPath)) {
    const envContent = readFileSync(envPath, 'utf8');
    
    // Check VITE_PACKAGE_ID
    const packageIdMatch = envContent.match(/^VITE_PACKAGE_ID=(.*)$/m);
    if (packageIdMatch && packageIdMatch[1] === deployment.packageId) {
      console.log(`   ${colors.green}✓ VITE_PACKAGE_ID matches${colors.reset}`);
    } else {
      console.log(`   ${colors.yellow}⚠ VITE_PACKAGE_ID mismatch${colors.reset}`);
      if (packageIdMatch) {
        console.log(`     Expected: ${deployment.packageId}`);
        console.log(`     Found: ${packageIdMatch[1]}`);
      }
    }
    
    // Check VITE_PROFILE_REGISTRY_ID
    const registryIdMatch = envContent.match(/^VITE_PROFILE_REGISTRY_ID=(.*)$/m);
    if (registryIdMatch && registryIdMatch[1] === deployment.profileRegistryId) {
      console.log(`   ${colors.green}✓ VITE_PROFILE_REGISTRY_ID matches${colors.reset}`);
    } else if (deployment.profileRegistryId) {
      console.log(`   ${colors.yellow}⚠ VITE_PROFILE_REGISTRY_ID mismatch${colors.reset}`);
      if (registryIdMatch) {
        console.log(`     Expected: ${deployment.profileRegistryId}`);
        console.log(`     Found: ${registryIdMatch[1]}`);
      }
    }
    
    // Check VITE_FACTORY_ID
    const factoryIdMatch = envContent.match(/^VITE_FACTORY_ID=(.*)$/m);
    if (factoryIdMatch && factoryIdMatch[1] === deployment.factoryId) {
      console.log(`   ${colors.green}✓ VITE_FACTORY_ID matches${colors.reset}`);
    } else if (deployment.factoryId) {
      console.log(`   ${colors.yellow}⚠ VITE_FACTORY_ID mismatch${colors.reset}`);
      if (factoryIdMatch) {
        console.log(`     Expected: ${deployment.factoryId}`);
        console.log(`     Found: ${factoryIdMatch[1]}`);
      }
    }
  } else {
    console.log(`   ${colors.red}✗ .env.local not found${colors.reset}`);
  }
  
  // Summary
  console.log('\n' + '─'.repeat(60));
  if (allValid) {
    console.log(`${colors.bright}${colors.green}✓ All resources verified successfully!${colors.reset}`);
  } else {
    console.log(`${colors.bright}${colors.red}✗ Some resources could not be verified${colors.reset}`);
    console.log(`${colors.yellow}You may need to redeploy the contracts${colors.reset}`);
  }
  
  // Show deployment info
  console.log('\nDeployment Info:');
  console.log(`  Network: ${deployment.network}`);
  console.log(`  Timestamp: ${deployment.timestamp}`);
  console.log(`  Transaction: ${deployment.deploymentTx}`);
  console.log(`  Explorer: ${colors.cyan}${deployment.explorerUrl}/tx/${deployment.deploymentTx}${colors.reset}`);
  
  return allValid;
}

// Main
async function main() {
  const network = process.argv[2] || 'devnet';
  
  try {
    const valid = await verifyDeployment(network);
    process.exit(valid ? 0 : 1);
  } catch (error) {
    console.error(`${colors.red}Error:${colors.reset}`, error.message);
    process.exit(1);
  }
}

main().catch(console.error);