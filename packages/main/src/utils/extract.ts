const extract = require('extract-zip');
import {join} from 'path';
import {existsSync, mkdirSync, renameSync, rmdirSync} from 'fs';

export async function extractChromeBin() {
  const resourcesPath = process.resourcesPath;
  const chromeZipPath = join(resourcesPath, 'Chrome-bin.zip');
  const tempExtractPath = join(resourcesPath, 'temp-chrome-bin');

  //Check whether the temporary decompression directory exists
  if (!existsSync(tempExtractPath)) {
    mkdirSync(tempExtractPath);
  }

  const chromeBinPath = join(resourcesPath, 'Chrome-bin');

  //Check if the Chrome-bin directory exists
  if (!existsSync(chromeBinPath)) {
    try {
      await extract(chromeZipPath, {dir: tempExtractPath});
      console.log('Chrome-bin extraction complete');

      //Check and adjust directory structure
      const extractedDirPath = join(tempExtractPath, 'Chrome-bin');
      if (existsSync(extractedDirPath)) {
        renameSync(extractedDirPath, chromeBinPath);
        rmdirSync(tempExtractPath, {recursive: true});
        return {result: true, exist: false};
      } else {
        return {result: false, error: 'Expected Chrome-bin directory not found inside ZIP'};
      }
    } catch (err) {
      console.error('Error extracting Chrome-bin.zip:', err);
      return {result: false, error: err};
    }
  } else {
    console.log('Chrome-bin already exists');
    return {result: true, exist: true};
  }
}
