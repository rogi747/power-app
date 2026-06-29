import {getAllWindows} from './demo/window.js';
import fs from 'fs-extra';
import path from 'path';

async function main() {
  const fromPath = 'E:\\.ADSPOWER_GLOBAL\\cache';
  const toPath = 'E:\\ChromePowerCache\\chrome';
  const adsDirSuffix = '_g1nkg14';
  try {
    const windows = (await getAllWindows()).filter(f => f.group_id);
    console.log(windows[0]);

    for (const window of windows) {
      const fromDir = path.join(fromPath, window.profile_id + adsDirSuffix, 'Default');
      const toDir = path.join(toPath, window.profile_id, 'Default');

      //Make sure the target directory exists
      await fs.ensureDir(toDir);

      //List of folders to copy
      const foldersToMove = [
        'Extension Rules',
        'Extension Scripts',
        'Extension State',
        'Local Extension Settings',
        'Local Storage',
        'IndexedDB',
      ];

      //List of files to copy
      const filesToMove = ['Bookmarks', 'Bookmarks.bak', 'History', 'History-journal'];

      //copy folder
      for (const folder of foldersToMove) {
        const source = path.join(fromDir, folder);
        const destination = path.join(toDir, folder);

        if (await fs.pathExists(source)) {
          console.log(`Copying folder: ${folder} (${window.profile_id})`);
          if (await fs.pathExists(destination)) {
            await fs.remove(destination);
          }
          await fs.copy(source, destination);
        } else {
          console.log(`Source folder does not exist: ${folder} (${window.profile_id})`);
        }
      }

      //Copy files
      for (const file of filesToMove) {
        const source = path.join(fromDir, file);
        const destination = path.join(toDir, file);

        if (await fs.pathExists(source)) {
          console.log(`Copying file: ${file} (${window.profile_id})`);
          await fs.copy(source, destination, {overwrite: true});
        } else {
          console.log(`Source file does not exist: ${file} (${window.profile_id})`);
        }
      }

      console.log(`Completed data migration for ${window.profile_id}`);
    }

    console.log('All profile configurations migrated');
  } catch (error) {
    console.error('Error occurred during execution:', error);
  }
}

main();
