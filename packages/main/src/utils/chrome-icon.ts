import {join} from 'path';
import pngToIco from 'png-to-ico';
import {existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync} from 'fs';
import {app} from 'electron';
import {execSync} from 'child_process';
import {createLogger} from '../../../shared/utils/logger';
import {MAIN_LOGGER_LABEL} from '../constants';
import sharp from 'sharp';

const logger = createLogger(MAIN_LOGGER_LABEL);

export async function generateChromeIcon(
  profileDir: string,
  tag: string | number,
): Promise<string> {
  const winChromeIcoPath = join(profileDir, 'Default', 'Google Profile.ico');
  const macChromeIcoPath = join(profileDir, 'Default', 'Google Profile.icns');
  const isMac = process.platform === 'darwin';
  const icoPath = isMac ? macChromeIcoPath : winChromeIcoPath;

  try {
    //Make sure the target directory exists
    const targetDir = join(profileDir, 'Default');
    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, {recursive: true});
    }

    //Temporary file path
    const tempPngPath = join(targetDir, 'temp_icon.png');
    const outputPngPath = join(targetDir, 'modified_icon.png');

    //Directly look for PNG format icons
    const pngIconPaths = [
      join(app.isPackaged ? process.resourcesPath : process.cwd(), 'buildResources', 'icon.png'),
      join(app.isPackaged ? process.resourcesPath : process.cwd(), 'assets', 'icon.png'),
      join(app.isPackaged ? process.resourcesPath : process.cwd(), 'resources', 'icon.png'),
    ];

    let sourceIconPath = '';
    for (const path of pngIconPaths) {
      if (existsSync(path)) {
        sourceIconPath = path;
        break;
      }
    }

    if (!sourceIconPath) {
      logger.error(
        'PNG icon not found, please ensure icon.png exists in buildResources or assets directory',
      );
      return '';
    }

    //Copy PNG icon directly to temporary file
    const pngBuffer = readFileSync(sourceIconPath);
    writeFileSync(tempPngPath, pngBuffer);

    //Get image information
    const metadata = await sharp(tempPngPath).metadata();
    const width = metadata.width || 128;
    const height = metadata.height || 128;

    //Create the bottom label area (blue background, 20% of the bottom height of the image)
    const tagHeight = Math.floor(height * 0.25);
    const tagY = height - tagHeight;

    //Create SVG overlay
    const svgBuffer = Buffer.from(`
        <svg width="${width}" height="${height}">
          <rect x="0" y="${tagY}" width="${width}" height="${tagHeight}" fill="#1677ff" />
          <text
            x="${width / 2}"
            y="${tagY + tagHeight * 0.86}"
            font-family="Arial"
            font-size="${tagHeight}"
            font-weight="bold"
            fill="white"
            text-anchor="middle"
            dominant-baseline="middle"
          >${tag.toString()}</text>
        </svg>
      `);

    //Add SVG overlay to image
    await sharp(tempPngPath)
      .composite([{input: svgBuffer}])
      .toFile(outputPngPath);

    //Step 3: Convert PNG back to platform-specific format
    if (isMac) {
      //macOS: Convert png to icns using sips
      execSync(`sips -s format icns "${outputPngPath}" --out "${icoPath}"`);
    } else {
      //Windows: Convert png to ico using png-to-ico
      try {
        const pngBuffer = readFileSync(outputPngPath);
        const icoBuffer = await pngToIco([pngBuffer]);
        writeFileSync(icoPath, icoBuffer);
      } catch (err) {
        logger.error(`Failed to convert PNG to ICO: ${err}`);
        return '';
      }
    }

    //Clean temporary files
    try {
      if (existsSync(tempPngPath)) {
        unlinkSync(tempPngPath);
      }
      if (existsSync(outputPngPath)) {
        unlinkSync(outputPngPath);
      }
    } catch (err) {
      logger.warn(`Failed to clean temporary files: ${err}`);
    }

    logger.info(`Successfully created labeled icon for ${isMac ? 'macOS' : 'Windows'}: ${icoPath}`);
    return icoPath;
  } catch (error) {
    logger.error(`Failed to generate Chrome icon: ${error}`);
    return '';
  }
}
