#!/usr/bin/env node

/**
 * MemeFlow Post-Deployment Testing Script
 * 
 * This script performs comprehensive testing of deployed contracts to ensure
 * they are working correctly and the frontend can interact with them.
 * 
 * Features:
 * - Contract existence validation
 * - Function call testing
 * - Frontend integration verification
 * - Network connectivity tests
 * - Configuration validation
 * - Performance benchmarking
 * 
 * Usage: node scripts/test-deployment.js [network] [options]
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, '..');

class DeploymentTester {
  constructor(network = 'testnet', options = {}) {
    this.network = network;
    this.options = options;
    this.deploymentFile = path.join(PROJECT_ROOT, 'public', `deployment-${network}.json`);
    this.testResults = {
      network,
      timestamp: new Date().toISOString(),
      tests: [],
      summary: { passed: 0, failed: 0, warnings: 0 }
    };
    
    this.log(`🧪 Testing MemeFlow Deployment`);
    this.log(`📡 Network: ${network.toUpperCase()}`);
  }

  log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const icons = { 
      info: '📋', 
      success: '✅', 
      error: '❌', 
      warning: '⚠️', 
      progress: '⏳',
      test: '🧪'
    };
    console.log(`${icons[type] || '📋'} [${timestamp}] ${message}`);
  }

  recordTest(name, passed, details = null, warning = false) {
    const test = {
      name,
      passed,
      warning,
      details,
      timestamp: new Date().toISOString()
    };
    
    this.testResults.tests.push(test);
    
    if (warning) {
      this.testResults.summary.warnings++;
    } else if (passed) {
      this.testResults.summary.passed++;
    } else {
      this.testResults.summary.failed++;
    }
    
    const icon = warning ? '⚠️' : passed ? '✅' : '❌';
    this.log(`${icon} ${name}${details ? ': ' + details : ''}`, warning ? 'warning' : passed ? 'success' : 'error');
    
    return passed;
  }

  async loadDeployment() {
    this.log('Loading deployment configuration...', 'progress');
    
    if (!existsSync(this.deploymentFile)) {
      throw new Error(`No deployment file found for ${this.network}`);
    }
    
    try {
      const deployment = JSON.parse(readFileSync(this.deploymentFile, 'utf8'));
      this.deployment = deployment;
      
      this.recordTest(
        'Deployment Config Load',
        true,
        `Package: ${deployment.packageId.slice(0, 10)}...`
      );
      
      return deployment;
    } catch (error) {
      this.recordTest('Deployment Config Load', false, error.message);
      throw error;
    }
  }

  async testNetworkConnectivity() {
    this.log('Testing network connectivity...', 'progress');
    
    try {
      // Test RPC endpoint
      const rpcTest = `sui client switch --env ${this.network} && sui client active-env`;
      const rpcResult = execSync(rpcTest, { 
        encoding: 'utf8', 
        stdio: 'pipe',
        timeout: 10000 
      });
      
      const isConnected = rpcResult.includes(this.deployment.rpcUrl) || 
                         rpcResult.includes(this.network);
      
      this.recordTest(
        'RPC Connectivity',
        isConnected,
        `Connected to ${this.deployment.rpcUrl}`
      );
      
      return isConnected;
    } catch (error) {
      this.recordTest('RPC Connectivity', false, error.message);
      return false;
    }
  }

  async testContractExistence() {
    this.log('Testing contract object existence...', 'progress');
    
    const tests = [
      { name: 'Package Object', id: this.deployment.packageId },
      { name: 'Factory Object', id: this.deployment.factoryId },
    ];
    
    let allPassed = true;
    
    for (const test of tests) {
      if (!test.id || test.id === '0x0000000000000000000000000000000000000000000000000000000000000000') {
        this.recordTest(`${test.name} Existence`, false, 'Placeholder ID - contracts not deployed', true);
        allPassed = false;
        continue;
      }
      
      try {
        const objectCmd = `sui client object ${test.id} --json`;
        const result = execSync(objectCmd, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 15000
        });
        
        const objectData = JSON.parse(result);
        const exists = objectData.data && objectData.data.objectId === test.id;
        
        this.recordTest(
          `${test.name} Existence`,
          exists,
          exists ? `Found at ${test.id.slice(0, 10)}...` : 'Object not found'
        );
        
        if (!exists) allPassed = false;
        
      } catch (error) {
        this.recordTest(`${test.name} Existence`, false, error.message);
        allPassed = false;
      }
    }
    
    return allPassed;
  }

  async testFactoryFunctionality() {
    this.log('Testing factory contract functions...', 'progress');
    
    if (!this.deployment.factoryId) {
      this.recordTest('Factory Function Tests', false, 'Factory ID not available');
      return false;
    }
    
    const functionTests = [
      {
        name: 'Get Factory Stats',
        module: 'meme_token_factory',
        function: 'get_factory_stats',
        args: [this.deployment.factoryId]
      },
      {
        name: 'Token Exists Check',
        module: 'meme_token_factory', 
        function: 'token_exists',
        args: [this.deployment.factoryId, 'NONEXISTENT']
      }
    ];
    
    let allPassed = true;
    
    for (const test of functionTests) {
      try {
        const args = test.args.map(arg => 
          typeof arg === 'string' && arg.startsWith('0x') ? arg : `"${arg}"`
        ).join(' ');
        
        const callCmd = `sui client call ` +
          `--package ${this.deployment.packageId} ` +
          `--module ${test.module} ` +
          `--function ${test.function} ` +
          `--args ${args} ` +
          `--gas-budget 10000000 ` +
          `--json`;
        
        const result = execSync(callCmd, {
          encoding: 'utf8',
          stdio: 'pipe',
          timeout: 30000
        });
        
        const callResult = JSON.parse(result);
        const success = callResult.effects && 
                       callResult.effects.status && 
                       callResult.effects.status.status === 'success';
        
        this.recordTest(
          `Factory Function: ${test.name}`,
          success,
          success ? 'Call successful' : 'Call failed'
        );
        
        if (!success) allPassed = false;
        
      } catch (error) {
        this.recordTest(`Factory Function: ${test.name}`, false, error.message);
        allPassed = false;
      }
    }
    
    return allPassed;
  }

  async testFrontendIntegration() {
    this.log('Testing frontend integration...', 'progress');
    
    try {
      // Test configuration validity first
      const configFile = path.join(PROJECT_ROOT, 'src', 'lib', 'config.ts');
      const contractsFile = path.join(PROJECT_ROOT, 'src', 'lib', 'contracts.ts');
      
      if (!existsSync(configFile)) {
        this.recordTest('Frontend Integration', false, 'Config file missing');
        return false;
      }
      
      if (!existsSync(contractsFile)) {
        this.recordTest('Frontend Integration', false, 'Contracts file missing');
        return false;
      }
      
      // Check if TypeScript can compile the files
      try {
        execSync('npm run typecheck', {
          stdio: 'pipe',
          timeout: 30000,
          cwd: PROJECT_ROOT
        });
        
        this.recordTest('Frontend Integration', true, 'TypeScript files compile successfully');
        return true;
        
      } catch (tscError) {
        this.recordTest('Frontend Integration', false, 'TypeScript compilation failed');
        return false;
      }
      
    } catch (error) {
      this.recordTest('Frontend Integration', false, error.message);
      return false;
    }
  }

  async testConfigurationValidity() {
    this.log('Testing configuration validity...', 'progress');
    
    const checks = [
      {
        name: 'Package ID Format',
        test: () => /^0x[a-fA-F0-9]{64}$/.test(this.deployment.packageId),
        value: this.deployment.packageId
      },
      {
        name: 'Factory ID Format',
        test: () => /^0x[a-fA-F0-9]{64}$/.test(this.deployment.factoryId || ''),
        value: this.deployment.factoryId
      },
      {
        name: 'Network RPC URL',
        test: () => this.deployment.rpcUrl && this.deployment.rpcUrl.startsWith('http'),
        value: this.deployment.rpcUrl
      },
      {
        name: 'Explorer URL',
        test: () => this.deployment.explorerUrl && this.deployment.explorerUrl.startsWith('http'),
        value: this.deployment.explorerUrl
      },
      {
        name: 'Deployment Timestamp',
        test: () => new Date(this.deployment.timestamp).getTime() > 0,
        value: this.deployment.timestamp
      }
    ];
    
    let allValid = true;
    
    for (const check of checks) {
      const valid = check.test();
      this.recordTest(
        `Config: ${check.name}`,
        valid,
        valid ? 'Valid' : `Invalid: ${check.value}`
      );
      
      if (!valid) allValid = false;
    }
    
    return allValid;
  }

  async testGasPriceAndLimits() {
    this.log('Testing gas prices and limits...', 'progress');
    
    try {
      // Test a simple call to check gas consumption
      const gasTestCmd = `sui client call ` +
        `--package ${this.deployment.packageId} ` +
        `--module meme_token_factory ` +
        `--function get_factory_stats ` +
        `--args ${this.deployment.factoryId} ` +
        `--gas-budget 5000000 ` +
        `--json`;
      
      const result = execSync(gasTestCmd, {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 20000
      });
      
      const gasResult = JSON.parse(result);
      const gasUsed = gasResult.effects?.gasUsed;
      
      if (gasUsed) {
        const computationCost = parseInt(gasUsed.computationCost || '0');
        const storageCost = parseInt(gasUsed.storageCost || '0');
        const totalCost = computationCost + storageCost;
        
        // Check if gas usage is reasonable (under 1M gas units)
        const reasonable = totalCost < 1000000;
        
        this.recordTest(
          'Gas Usage Test',
          reasonable,
          `Total: ${totalCost} units (Computation: ${computationCost}, Storage: ${storageCost})`,
          !reasonable
        );
        
        return reasonable;
      } else {
        this.recordTest('Gas Usage Test', false, 'Could not retrieve gas usage data');
        return false;
      }
      
    } catch (error) {
      this.recordTest('Gas Usage Test', false, error.message);
      return false;
    }
  }

  async testTransactionHistory() {
    this.log('Testing transaction history...', 'progress');
    
    const transactions = [
      { name: 'Deployment Transaction', hash: this.deployment.deploymentTx },
      { name: 'Initialization Transaction', hash: this.deployment.initTx }
    ].filter(tx => tx.hash && tx.hash !== 'placeholder-transaction-hash');
    
    let allFound = true;
    
    for (const tx of transactions) {
      try {
        const txCmd = `sui client object ${tx.hash} --json`;
        execSync(txCmd, { stdio: 'pipe', timeout: 10000 });
        
        this.recordTest(`${tx.name} History`, true, `Found: ${tx.hash.slice(0, 20)}...`);
        
      } catch (error) {
        this.recordTest(`${tx.name} History`, false, `Not found: ${tx.hash}`);
        allFound = false;
      }
    }
    
    if (transactions.length === 0) {
      this.recordTest('Transaction History', true, 'No transactions to verify', true);
    }
    
    return allFound;
  }

  async performanceTest() {
    this.log('Running performance benchmarks...', 'progress');
    
    const startTime = Date.now();
    
    try {
      // Test multiple rapid calls
      const calls = [];
      for (let i = 0; i < 3; i++) {
        calls.push(
          execSync(`sui client call ` +
            `--package ${this.deployment.packageId} ` +
            `--module meme_token_factory ` +
            `--function get_factory_stats ` +
            `--args ${this.deployment.factoryId} ` +
            `--gas-budget 5000000 ` +
            `--json`, {
            encoding: 'utf8',
            stdio: 'pipe',
            timeout: 15000
          })
        );
      }
      
      const endTime = Date.now();
      const averageTime = (endTime - startTime) / calls.length;
      
      // Performance should be under 5 seconds per call on average
      const performant = averageTime < 5000;
      
      this.recordTest(
        'Performance Benchmark',
        performant,
        `Average call time: ${averageTime.toFixed(0)}ms`,
        averageTime > 3000 && averageTime < 5000
      );
      
      return performant;
      
    } catch (error) {
      this.recordTest('Performance Benchmark', false, error.message);
      return false;
    }
  }

  generateReport() {
    const { passed, failed, warnings } = this.testResults.summary;
    const total = passed + failed + warnings;
    const successRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '0';
    
    this.log('📊 Test Report Summary', 'info');
    this.log(`✅ Passed: ${passed}/${total} (${successRate}%)`);
    this.log(`❌ Failed: ${failed}`);
    this.log(`⚠️  Warnings: ${warnings}`);
    
    // Save detailed report
    const reportPath = path.join(PROJECT_ROOT, `test-report-${this.network}-${Date.now()}.json`);
    writeFileSync(reportPath, JSON.stringify(this.testResults, null, 2));
    
    this.log(`📄 Detailed report: ${path.basename(reportPath)}`);
    
    return {
      success: failed === 0,
      summary: this.testResults.summary,
      reportPath
    };
  }

  async runAllTests() {
    this.log('🚀 Starting comprehensive deployment tests...', 'progress');
    
    try {
      await this.loadDeployment();
      
      // Core functionality tests
      await this.testNetworkConnectivity();
      await this.testContractExistence();
      await this.testConfigurationValidity();
      await this.testFactoryFunctionality();
      await this.testFrontendIntegration();
      
      // Performance and history tests
      await this.testGasPriceAndLimits();
      await this.testTransactionHistory();
      await this.performanceTest();
      
      const report = this.generateReport();
      
      if (report.success) {
        this.log('🎉 All tests passed! Deployment is ready for use.', 'success');
      } else {
        this.log(`⚠️ ${report.summary.failed} test(s) failed. Please review the issues.`, 'warning');
      }
      
      return report;
      
    } catch (error) {
      this.log(`💥 Test suite failed: ${error.message}`, 'error');
      throw error;
    }
  }
}

// CLI Usage
async function main() {
  const args = process.argv.slice(2);
  const network = args.find(arg => !arg.startsWith('--')) || 'testnet';
  
  const options = {
    verbose: args.includes('--verbose'),
    skipPerformance: args.includes('--skip-performance')
  };
  
  const tester = new DeploymentTester(network, options);
  
  try {
    const report = await tester.runAllTests();
    process.exit(report.success ? 0 : 1);
    
  } catch (error) {
    console.error('Test execution failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { DeploymentTester };