/* eslint-disable */
// @ts-nocheck
import {batchCreateWindows, getAllWindows} from './demo/window.js';
import {openProfile} from './demo/profiles.js';

async function main() {
  try {
    //Create windows in batches
    const windowsToCreate = [{name: 'Window 1'}, {name: 'Window 2'}, {name: 'Window 3'}];

    console.log('Starting to create windows...');
    const createdWindows = await batchCreateWindows(windowsToCreate);
    console.log('Created windows:', createdWindows);

    console.log('Open window with specified id');
    const openResult = await openProfile(247);
    console.log('Open result:', openResult);

    const windows = await getAllWindows();

    const openedWindows = windows?.filter(f => f.status > 1);
    console.log('Opened windows:', openedWindows);

    const connectInfo = await fetch(`http://localhost:${openedWindows[0].port}/json/version`);

    console.log(await connectInfo.json());
  } catch (error) {
    console.error('Error occurred during execution:', error);
  }
}

main();
