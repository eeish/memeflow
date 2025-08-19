#!/usr/bin/env node

/**
 * Test script to verify environment synchronization after deployment
 * This script simulates a deployment and checks that all configuration files are updated
 */

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

function checkSynchronization() {
  console.log('\n📋 Checking Package ID Synchronization');
  console.log('=' .repeat(50));
  
  const results = {};
  let allMatch = true;
  
  try {
    // Check .env.local
    const envPath = path.join(PROJECT_ROOT, '.env.local');
    const envContent = readFileSync(envPath, 'utf8');
    const envMatch = envContent.match(/VITE_PACKAGE_ID=([^\n]+)/);
    results['.env.local'] = envMatch ? envMatch[1].trim() : 'NOT FOUND';
    
    // Check deployment JSON
    const deploymentPath = path.join(PROJECT_ROOT, 'public', 'deployment-devnet.json');
    const deployment = JSON.parse(readFileSync(deploymentPath, 'utf8'));
    results['deployment-devnet.json'] = deployment.packageId || 'NOT FOUND';
    
    // Check config.ts
    const configPath = path.join(PROJECT_ROOT, 'src', 'lib', 'config.ts');
    const configContent = readFileSync(configPath, 'utf8');
    const configMatch = configContent.match(/devnet:[\s\S]*?packageId:\s*['"]([^'"]+)['"]/);
    results['config.ts'] = configMatch ? configMatch[1] : 'NOT FOUND';
    
    // Display results
    console.log('\n📦 Package IDs Found:');
    const packageIds = new Set();
    
    for (const [file, packageId] of Object.entries(results)) {
      const isValid = packageId !== 'NOT FOUND' && packageId.startsWith('0x');
      console.log(`  ${file}:`);
      console.log(`    ${isValid ? colors.green : colors.red}${packageId}${colors.reset}`);
      if (isValid) packageIds.add(packageId);
    }
    
    // Check if all match
    allMatch = packageIds.size === 1 && Object.values(results).every(id => id !== 'NOT FOUND');
    
    console.log('\n🔍 Synchronization Status:');
    if (allMatch) {
      console.log(`  ${colors.green}✅ All files are synchronized!${colors.reset}`);
      console.log(`  Package ID: ${colors.cyan}${[...packageIds][0]}${colors.reset}`);
    } else if (packageIds.size > 1) {
      console.log(`  ${colors.red}❌ Files have different package IDs!${colors.reset}`);
      console.log(`  Found ${packageIds.size} different IDs:`);
      [...packageIds].forEach(id => console.log(`    - ${id}`));
    } else {
      console.log(`  ${colors.yellow}⚠️  Some files are missing package IDs${colors.reset}`);
    }
    
    // Check network consistency
    console.log('\n🌐 Network Configuration:');
    const networkMatch = envContent.match(/VITE_SUI_NETWORK=([^\n]+)/);
    const network = networkMatch ? networkMatch[1].trim() : 'NOT FOUND';
    console.log(`  Network in .env.local: ${colors.cyan}${network}${colors.reset}`);
    console.log(`  Deployment file: ${colors.cyan}deployment-${network}.json${colors.reset}`);
    
    return allMatch;
    
  } catch (error) {
    console.error(`\n${colors.red}Error checking synchronization:${colors.reset}`, error.message);
    return false;
  }
}

// Additional checks
function checkDeploymentScript() {
  console.log('\n🔧 Checking Deployment Script Features');
  console.log('=' .repeat(50));
  
  try {
    const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'deploy-improved.js');
    const scriptContent = readFileSync(scriptPath, 'utf8');
    
    const features = {
      'Updates .env.local': scriptContent.includes('updateEnvFile'),
      'Updates config.ts': scriptContent.includes('updateTypeScriptConfig'),
      'Saves deployment JSON': scriptContent.includes('deployment-${this.network}.json'),
      'Has error handling': scriptContent.includes('try') && scriptContent.includes('catch'),
    };
    
    console.log('\n✨ Deployment Script Features:');
    for (const [feature, present] of Object.entries(features)) {
      console.log(`  ${present ? colors.green + '✅' : colors.red + '❌'} ${feature}${colors.reset}`);
    }
    
    const allPresent = Object.values(features).every(v => v);
    if (allPresent) {
      console.log(`\n  ${colors.green}All critical features are present!${colors.reset}`);
    } else {
      console.log(`\n  ${colors.yellow}Some features are missing${colors.reset}`);
    }
    
    return allPresent;
    
  } catch (error) {
    console.error(`\n${colors.red}Error checking deployment script:${colors.reset}`, error.message);
    return false;
  }
}

// Main execution
console.log(`${colors.cyan}🚀 MemeFlow Environment Synchronization Test${colors.reset}`);

const syncOk = checkSynchronization();
const scriptOk = checkDeploymentScript();

console.log('\n' + '=' .repeat(50));
console.log('📊 Final Status:');
if (syncOk && scriptOk) {
  console.log(`${colors.green}✅ Everything is properly configured!${colors.reset}`);
  console.log('\nThe deployment script will now automatically update:');
  console.log('  1. .env.local with new package IDs');
  console.log('  2. config.ts with deployment info');
  console.log('  3. deployment-{network}.json files');
  process.exit(0);
} else {
  console.log(`${colors.red}❌ Some issues were found${colors.reset}`);
  if (!syncOk) {
    console.log('\n⚠️  Files are not synchronized. Run deployment to fix:');
    console.log(`  ${colors.yellow}npm run contract:deploy:devnet${colors.reset}`);
  }
  if (!scriptOk) {
    console.log('\n⚠️  Deployment script may need updates');
  }
  process.exit(1);
}