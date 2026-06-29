/* eslint-disable */
// @ts-nocheck
import {batchCreateWindows, getAllWindows} from './demo/window.js';
import {openProfile} from './demo/profiles.js';

async function main() {
  try {
    //Create windows in batches
    const windowsToCreate = [{name: 'window 1'}, {name: 'window 2'}, {name: 'window 3'}];

    console.log('Start creating windows...');
    const createdWindows = await batchCreateWindows(windowsToCreate);
    console.log('Created window:', createdWindows);

    console.log('Open the window with the specified id');
    const openResult = await openProfile(247);
    console.log('Open results:', openResult);

    const windows = await getAllWindows();

    const openedWindows = windows?.filter(f => f.status > 1);
    console.log('Open windows:', openedWindows);

    const connectInfo = await fetch(`http://localhost:${openedWindows[0].port}/json/version`);

    console.log(await connectInfo.json());
  } catch (error) {
    console.error('An error occurred during execution:', error);
  }
}

main();
