#!/usr/bin/env node

/**
 * Build native modules and organize output files according to platform and architecture
 * This script will:
 * 1. Determine the current operating system and architecture
 * 2. Execute the appropriate build command
 * 3. Create platform/architecture specific directories
 * 4. Move the built module to the corresponding directory
 */

const {execSync} = require('child_process');
const path = require('path');
const dotenv = require('dotenv');

//Load environment variables
dotenv.config();

//Get platform and architecture information
const platform = process.env.ELECTRON_PLATFORM || process.platform;
const arch = process.env.ELECTRON_ARCH || process.arch;

console.log(`Building native module (Platform: ${platform}, Arch: ${arch})`);

//Native module directory
const nativeAddonDir = path.join(__dirname, '../packages/main/src/native-addon');
const buildDir = path.join(nativeAddonDir, 'build');
const releaseDir = path.join(buildDir, 'Release');

//Create platform- and architecture-specific target directory paths
const targetDir = path.join(releaseDir, `${platform}-${arch}`);
const sourcePath = path.join(releaseDir, 'window-addon.node');

try {
  //Check if the built file already exists
  const fs = require('fs');
  const targetAddonPath = path.join(targetDir, 'window-addon.node');

  if (fs.existsSync(targetAddonPath)) {
    console.log(`✓ Native addon already exists at ${targetAddonPath}`);
    console.log('Skipping rebuild to avoid file lock issues');
    process.exit(0);
  }

  //Execute different build commands according to different platforms and architectures
  console.log(`Starting to build native module for ${platform}-${arch}...`);

  try {
    if (platform === 'win32') {
      console.log('Building native module on Windows platform...');
      //Explicitly specify msvs_version
      execSync('npm run build:native-addon -- --msvs_version=2022', {stdio: 'inherit'});
    } else if (platform === 'darwin') {
      if (arch === 'arm64') {
        console.log('Building native module on macOS (arm64)...');
        execSync('npm run build:native-addon:mac-arm64', {stdio: 'inherit'});
      } else if (arch === 'x64') {
        console.log('Building native module on macOS (x64)...');
        execSync('npm run build:native-addon:mac-x64', {stdio: 'inherit'});
      } else {
        console.log(`Building native module on macOS (${arch})...`);
        execSync('npm run build:native-addon', {stdio: 'inherit'});
      }
    } else {
      //Processing on other platforms
      console.log(`Building native module on ${platform} platform...`);
      execSync('npm run build:native-addon', {stdio: 'inherit'});
    }
  } catch (buildError) {
    // Check if source file exists even though build failed
    if (fs.existsSync(sourcePath)) {
      console.warn('Build command failed, but source file exists. Continuing...');
    } else {
      throw buildError;
    }
  }

  console.log('Build command executed, checking output files...');

  //List directory contents using the command line
  if (platform === 'win32') {
    execSync(`dir "${buildDir}"`, {stdio: 'inherit'});
    execSync(`dir "${releaseDir}"`, {stdio: 'inherit'});
  } else {
    execSync(`ls -la "${buildDir}"`, {stdio: 'inherit'});
    execSync(`ls -la "${releaseDir}"`, {stdio: 'inherit'});
  }

  //Create directories and copy files using the command line
  console.log('Creating target directory and copying files...');
  if (platform === 'win32') {
    execSync(`mkdir "${targetDir}" 2>nul || echo "Directory already exists"`, {stdio: 'inherit'});
    execSync(`copy "${sourcePath}" "${targetDir}\\window-addon.node"`, {stdio: 'inherit'});
  } else {
    execSync(`mkdir -p "${targetDir}"`, {stdio: 'inherit'});
    execSync(`cp "${sourcePath}" "${targetDir}/window-addon.node"`, {stdio: 'inherit'});
  }

  //Verify file copied
  console.log('Verifying files copied...');
  if (platform === 'win32') {
    execSync(`dir "${targetDir}"`, {stdio: 'inherit'});
  } else {
    execSync(`ls -la "${targetDir}"`, {stdio: 'inherit'});
  }

  console.log('Native module build and organization complete!');
} catch (error) {
  console.error('Error occurred during build process:', error);
  // If we are in CI, we want to fail the build
  if (process.env.GITHUB_ACTIONS) {
    process.exit(1);
  }
  console.error('This is not critical if the addon already exists or will be built later');
  // Don't exit with error code to allow npm install to continue
  process.exit(0);
}
