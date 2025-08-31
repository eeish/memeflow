#!/usr/bin/env node

/**
 * Test script to create a profile directly using the CLI
 * This helps verify the contracts are working correctly
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..');

// Read deployment config
const deployment = JSON.parse(readFileSync(path.join(PROJECT_ROOT, 'public/deployment-devnet.json'), 'utf8'));

console.log('Testing profile creation with:');
console.log('Package ID:', deployment.packageId);
console.log('Registry ID:', deployment.profileRegistryId);

// First, verify the registry exists
try {
  console.log('\nVerifying ProfileRegistry object...');
  const result = execSync(`sui client object ${deployment.profileRegistryId} --json 2>/dev/null`, { encoding: 'utf8' });
  const obj = JSON.parse(result);
  console.log('✓ Registry exists:', obj.content.type);
  console.log('  Owner:', JSON.stringify(obj.owner));
} catch (error) {
  console.error('✗ Registry not found!');
  process.exit(1);
}

// Create a test profile using the CLI
console.log('\nCreating test profile...');

const username = 'testuser';
const bio = 'Test bio';
const avatarUrl = '';

// Build the transaction
// For vector<u8>, we need to pass as array of decimal numbers
const usernameBytes = Array.from(Buffer.from(username)).join(',');
const bioBytes = Array.from(Buffer.from(bio)).join(',');
const avatarBytes = avatarUrl ? Array.from(Buffer.from(avatarUrl)).join(',') : '';

const txCommand = `sui client call \
  --package ${deployment.packageId} \
  --module memeflow_social \
  --function create_memeflow_profile \
  --args "[${usernameBytes}]" \
         "[${bioBytes}]" \
         "[${avatarBytes}]" \
         ${deployment.profileRegistryId} \
  --gas-budget 100000000`;

console.log('\nCommand:', txCommand);

try {
  const result = execSync(txCommand, { encoding: 'utf8' });
  console.log('✓ Profile created successfully!');
  console.log(result);
} catch (error) {
  console.error('✗ Failed to create profile:');
  console.error(error.stdout || error.message);
  
  // Try alternative approach
  console.log('\nTrying alternative approach with programmable transaction...');
  
  const ptbCommand = `sui client ptb \
    --move-call ${deployment.packageId}::memeflow_social::create_memeflow_profile \
    --args '["${Buffer.from(username).toString('hex')}"]' \
           '["${Buffer.from(bio).toString('hex')}"]' \
           '["${Buffer.from(avatarUrl).toString('hex')}"]' \
           ${deployment.profileRegistryId} \
    --gas-budget 100000000`;
  
  try {
    const ptbResult = execSync(ptbCommand, { encoding: 'utf8' });
    console.log('✓ Profile created with PTB!');
    console.log(ptbResult);
  } catch (ptbError) {
    console.error('✗ PTB also failed:');
    console.error(ptbError.stdout || ptbError.message);
  }
}