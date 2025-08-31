#!/usr/bin/env node

/**
 * Script to find the ProfileRegistry object ID from a deployed package
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message, type = 'info') {
  const prefix = {
    info: `${colors.blue}ℹ${colors.reset}`,
    success: `${colors.green}✓${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    warning: `${colors.yellow}⚠${colors.reset}`,
  };
  console.log(`${prefix[type] || prefix.info} ${message}`);
}

async function findProfileRegistry() {
  // Read current deployment config
  const deploymentFile = path.join(PROJECT_ROOT, 'public', 'deployment-devnet.json');
  if (!existsSync(deploymentFile)) {
    log('Deployment file not found. Please deploy contracts first.', 'error');
    process.exit(1);
  }

  const deployment = JSON.parse(readFileSync(deploymentFile, 'utf8'));
  const packageId = deployment.packageId;

  log(`Package ID: ${colors.cyan}${packageId}${colors.reset}`, 'info');
  log('Searching for ProfileRegistry...', 'info');

  try {
    // Query the deployment transaction to find all created objects
    const txResult = execSync(
      `sui client tx-block ${deployment.deploymentTx} --json 2>/dev/null`,
      { encoding: 'utf8' }
    );
    
    const tx = JSON.parse(txResult);
    const createdObjects = tx.effects.created || [];
    
    // Find shared objects
    const sharedObjects = createdObjects.filter(obj => 
      obj.owner && typeof obj.owner === 'object' && 'Shared' in obj.owner
    );

    log(`Found ${sharedObjects.length} shared objects:`, 'info');
    
    // Check each shared object's type
    for (let i = 0; i < sharedObjects.length; i++) {
      const objId = sharedObjects[i].reference.objectId;
      
      try {
        const objResult = execSync(
          `sui client object ${objId} --json 2>/dev/null`,
          { encoding: 'utf8' }
        );
        
        const obj = JSON.parse(objResult);
        const objType = obj.content?.type || 'unknown';
        
        console.log(`  ${i + 1}. ${colors.cyan}${objId}${colors.reset}`);
        console.log(`     Type: ${objType}`);
        
        // Check if this is the ProfileRegistry
        if (objType.includes('ProfileRegistry')) {
          log(`Found ProfileRegistry: ${colors.green}${objId}${colors.reset}`, 'success');
          
          // Update the environment file
          updateEnvFile(objId);
          
          return objId;
        }
      } catch (err) {
        console.log(`     Could not fetch object details`);
      }
    }
    
    // If ProfileRegistry not found, it might not have been deployed
    log('ProfileRegistry not found. The memeflow_social module may not have been deployed.', 'warning');
    log('Using the first shared object as a fallback...', 'warning');
    
    if (sharedObjects.length > 0) {
      const fallbackId = sharedObjects[0].reference.objectId;
      log(`Fallback object ID: ${colors.yellow}${fallbackId}${colors.reset}`, 'warning');
      updateEnvFile(fallbackId);
      return fallbackId;
    }
    
  } catch (error) {
    log(`Error querying blockchain: ${error.message}`, 'error');
    process.exit(1);
  }
}

function updateEnvFile(registryId) {
  const envPath = path.join(PROJECT_ROOT, '.env.local');
  
  if (!existsSync(envPath)) {
    log('.env.local not found', 'error');
    return;
  }
  
  let content = readFileSync(envPath, 'utf8');
  
  // Check if VITE_PROFILE_REGISTRY_ID exists
  if (content.includes('VITE_PROFILE_REGISTRY_ID')) {
    // Update existing
    content = content.replace(
      /VITE_PROFILE_REGISTRY_ID=.*/g,
      `VITE_PROFILE_REGISTRY_ID=${registryId}`
    );
  } else {
    // Add new
    content += `\n# Profile Registry ID (found by find-registry.js)\nVITE_PROFILE_REGISTRY_ID=${registryId}\n`;
  }
  
  writeFileSync(envPath, content);
  log('Updated .env.local with VITE_PROFILE_REGISTRY_ID', 'success');
}

// Run the script
console.log();
log('Finding ProfileRegistry ID...', 'info');
console.log();

findProfileRegistry().then(() => {
  console.log();
  log('Done! Restart your dev server to use the new configuration.', 'success');
  console.log();
}).catch(error => {
  console.error(error);
  process.exit(1);
});