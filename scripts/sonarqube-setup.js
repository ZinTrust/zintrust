#!/usr/bin/env node
/**
 * SonarQube Setup Script
 * Interactive setup wizard for configuring SonarQube with Zintrust
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.log('\n🔍 Zintrust SonarQube Setup');
  console.log('================================\n');

  // Check sonar-scanner
  try {
    execSync('sonar-scanner --version', { stdio: 'pipe' });
    console.log('✅ sonar-scanner is installed\n');
  } catch {
    console.log('❌ sonar-scanner not found');
    console.log('Install with: npm install -g sonarqube-scanner\n');
    process.exit(1);
  }

  // Menu
  console.log('Select SonarQube setup option:');
  console.log('1) Local Server (Docker)');
  console.log('2) SonarQube Cloud');
  console.log('3) Configure Existing Server\n');

  const choice = await question('Enter choice (1-3): ');

  switch (choice.trim()) {
    case '1':
      await setupLocalServer();
      break;
    case '2':
      await setupSonarCloud();
      break;
    case '3':
      await setupExistingServer();
      break;
    default:
      console.log('❌ Invalid choice');
      process.exit(1);
  }

  rl.close();

  console.log('\n================================');
  console.log('Setup Complete! ✨\n');
  console.log('To run analysis:');
  console.log('  npm run test:sonar\n');
}

async function setupLocalServer() {
  console.log('\n📦 Starting SonarQube with Docker...\n');

  try {
    execSync('docker --version', { stdio: 'pipe' });
  } catch {
    console.log('❌ Docker not found. Please install Docker first.');
    process.exit(1);
  }

  try {
    // Check if container exists
    try {
      execSync('docker ps -a --format "{{.Names}}" | grep -q "^sonarqube$"', { shell: true });
      console.log('SonarQube container exists. Starting...');
      execSync('docker start sonarqube');
    } catch {
      console.log('Creating SonarQube container...');
      execSync(
        String.raw`docker run -d --name sonarqube \
        -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLED=true \
        -p 9000:9000 \
        sonarqube:latest`,
        { stdio: 'inherit' }
      );
    }

    console.log('\n⏳ Waiting for SonarQube to start (30-60 seconds)...');

    // Wait for server
    let ready = false;
    for (let i = 0; i < 12; i++) {
      try {
        const response = execSync(
          'curl -s http://localhost:9000/api/system/status 2>/dev/null || true',
          { encoding: 'utf-8' }
        );
        if (response.includes('"status":"UP"')) {
          ready = true;
          break;
        }
      } catch {
        // Ignore errors, server might not be ready yet
      }
      console.log(`  Attempt ${i + 1}/12...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    if (ready) {
      console.log('\n✅ SonarQube is ready!');
    } else {
      console.log('\n⚠️  SonarQube may still be starting. Check http://localhost:9000');
    }

    console.log('\n📝 Next steps:');
    console.log('1. Open http://localhost:9000');
    console.log('2. Login with admin/admin');
    console.log('3. Create a new project (Key: "ZinTrust_ZinTrust")');
    console.log('4. Generate a token in Administration → Security');
    console.log('5. Run: export SONAR_TOKEN=your_token_here');
    console.log('6. Run: npm run test:sonar');
  } catch (error) {
    console.error('Error setting up Docker:', error.message);
    process.exit(1);
  }
}

async function setupSonarCloud() {
  console.log('\n☁️  SonarQube Cloud Setup\n');
  console.log('Steps:');
  console.log('1. Go to https://sonarcloud.io/');
  console.log('2. Sign up with GitHub');
  console.log('3. Import this repository');
  console.log('4. Generate a token in Account → Security\n');

  const token = await question('Enter your SonarQube Cloud token: ');

  if (!token.trim()) {
    console.log('❌ Token is required');
    process.exit(1);
  }

  // Write to .env file
  const envContent = `SONAR_HOST_URL=https://sonarcloud.io\nSONAR_TOKEN=${token.trim()}\n`;
  fs.writeFileSync(path.join(process.cwd(), '.env.sonarqube'), envContent);

  console.log('\n✅ SonarQube Cloud configured');
  console.log('Token saved to .env.sonarqube');
  console.log('\n📝 Next steps:');
  console.log('1. Add to .github/workflows/sonarqube.yml:');
  console.log('   secrets: SONAR_TOKEN and SONAR_ORGANIZATION');
  console.log('2. Run: npm run test:sonar');
  console.log('3. View results at: https://sonarcloud.io/project/overview?id=zintrust');
}

async function setupExistingServer() {
  console.log('\n🔧 Configure Existing Server\n');

  const url = await question('Enter SonarQube URL (e.g., http://localhost:9000): ');
  const token = await question('Enter SonarQube token: ');

  if (!url.trim() || !token.trim()) {
    console.log('❌ URL and token are required');
    process.exit(1);
  }

  // Write to .env file
  const envContent = `SONAR_HOST_URL=${url.trim()}\nSONAR_TOKEN=${token.trim()}\n`;
  fs.writeFileSync(path.join(process.cwd(), '.env.sonarqube'), envContent);

  console.log('\n✅ SonarQube configured');
  console.log('Token saved to .env.sonarqube');
  console.log('\n📝 Next steps:');
  console.log('1. Run: npm run test:sonar');
  console.log('2. View results at: ' + url);
}

await main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
