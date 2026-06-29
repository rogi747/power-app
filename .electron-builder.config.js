/**
 * TODO: Rewrite this config to ESM
 * But currently electron-builder doesn't support ESM configs
 * @see https://github.com/develar/read-config-file/issues/10
 */
// const { notarize } = require('@electron/notarize');

require('dotenv').config();

/**
 * @type {() => import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration/configuration
 */
function getBuildTime() {
  return process.env.BUILD_TIME || new Date().getTime();
}

console.log('ELECTRON_PLATFORM', process.env.ELECTRON_PLATFORM);
console.log('ELECTRON_ARCH', process.env.ELECTRON_ARCH);

module.exports = async function () {
  const {getVersion} = await import('./version/getVersion.mjs');
  const config = {
    productName: 'Chrome Power',
    appId: 'com.chrome-power.app',
    directories: {
      output: 'dist',
      buildResources: 'buildResources',
    },
    nodeGypRebuild: false, // Disable node-gyp rebuild, use prebuilt binaries
    npmRebuild: false, // Disable @electron/rebuild to skip iohook compilation
    files: [
      'packages/**/dist/**',
      'packages/**/assets/**',
      'migrations',
      'package.json',
      'node_modules/sqlite3/lib/binding/**/*.node',
      'node_modules/@tkomde/iohook/**/*.node',
      'node_modules/iconv-corefoundation/lib/*.node',
      'buildResources/**/*',
      '!**/*.map', // exclude debug files
      '!**/*.ts',
      '!**/*.tsx',
    ],
    extraResources: [
      {
        from: 'migrations',
        to: 'app/migrations',
      },
      {
        from: 'assets',
        to: 'app/assets',
      },
      {
        from: 'buildResources',
        to: 'buildResources',
        filter: ['*.ico', '*.png', '*.icns'],
      },
    ],
    extraMetadata: {
      version: getVersion(),
      main: './packages/main/dist/index.cjs',
    },
    asar: true,
    asarUnpack: '**/*.{node,dll}',

    //Windows configuration
    win: {
      icon: 'buildResources/icon.ico',
      target: [
        {
          target: 'nsis',
          arch: ['x64'],
        },
      ],
      artifactName: '${productName}-${version}-${arch}-${os}-' + getBuildTime() + '.${ext}',
      signAndEditExecutable: false,
      compression: 'maximum', //Maximum compression (the installation package will be smaller, but the packaging time will be longer)
    },
    nsis: {
      oneClick: false,
      allowElevation: true,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: 'Chrome Power',
      installerIcon: 'buildResources/icon.ico',
      uninstallerIcon: 'buildResources/icon.ico',
      installerHeaderIcon: 'buildResources/icon.ico',
      menuCategory: true,
      artifactName: '${productName}-${version}-${arch}-${os}-' + getBuildTime() + '.${ext}',
    },

    //macOS configuration
    mac: {
      timestamp: false,
      icon: 'buildResources/icon.icns',
      notarize: false,
      identity: process.env.APPLE_IDENTITY,
      target: [
        {
          target: 'dmg',
          arch: [process.env.ELECTRON_ARCH || (process.arch === 'arm64' ? 'arm64' : 'x64')],
        },
      ],
      category: 'public.app-category.developer-tools',
      hardenedRuntime: true,
      gatekeeperAssess: false,
      entitlements: 'buildResources/entitlements.mac.plist',
      entitlementsInherit: 'buildResources/entitlements.mac.plist',
      type: 'distribution',
      strictVerify: false,
      artifactName: '${productName}-${version}-${arch}-${os}' + getBuildTime() + '.${ext}',
      signIgnore: [],
    },
    dmg: {
      sign: false,
      writeUpdateInfo: false,
      format: 'ULFO',
    },

    //Add GitHub release configuration
    publish: {
      provider: 'github',
      private: false,
      releaseType: 'draft',
    },

    //Copy window-addon.node to the final directory after packaging
    afterPack: async context => {
      const fs = require('fs');
      const path = require('path');
      const {electronPlatformName, arch, appOutDir} = context;

      //The arch of electron-builder is a numeric enumeration and needs to be converted to a string
      const archMap = {0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal'};
      const archString = archMap[arch] || String(arch);

      console.log(`Copying window-addon for ${electronPlatformName}-${archString}...`);

      //Native addon compiled products are placed in subdirectories according to platform/architecture
      const sourcePath = path.join(
        __dirname,
        `packages/main/src/native-addon/build/Release/${electronPlatformName}-${archString}/window-addon.node`,
      );

      //Mac apps have a .app package structure and require special handling of paths
      let targetDir;
      if (electronPlatformName === 'darwin') {
        const appName = context.packager.appInfo.productFilename;
        targetDir = path.join(
          appOutDir,
          `${appName}.app/Contents/Resources/app.asar.unpacked/node_modules/window-addon`,
        );
      } else {
        targetDir = path.join(appOutDir, 'resources/app.asar.unpacked/node_modules/window-addon');
      }
      const targetPath = path.join(targetDir, 'window-addon.node');

      try {
        //Check if the source file exists
        if (!fs.existsSync(sourcePath)) {
          console.error(`Source file not found: ${sourcePath}`);
          console.error('Please run npm run build:native-addon first');
          throw new Error('window-addon.node not found');
        }

        //Create target directory
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, {recursive: true});
          console.log(`Created directory: ${targetDir}`);
        }

        //Copy files
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`Successfully copied window-addon.node to ${targetPath}`);
      } catch (error) {
        console.error('Failed to copy window-addon:', error);
        throw error;
      }
    },
  };

  return config;
};
