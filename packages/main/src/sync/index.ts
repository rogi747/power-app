// import {ipcRenderer} from 'electron';
import type {SafeAny} from '../../../shared/types/db';

let windowAddon: unknown;
if (process.env.MODE === 'development') {
  // const isMac = process.platform === 'darwin';
  // windowAddon = require(path.join(
  //   __dirname,
  //   isMac
  //     ? '../src/native-addon/build/Release/window-addon.node'
  //     : '../src/native-addon/build/Release/window-addon.node',
  // ));
} else {
  // windowAddon = require(path.join(
  //   process.resourcesPath,
  //   'app.asar.unpacked',
  //   'node_modules',
  //   'window-addon',
  //   'window-addon.node',
  // ));
}
export const arrangeWindows = async () => {
  try {
    const arrangeResult = (windowAddon as unknown as SafeAny)!.arrangeWindows();
    console.log('arrangeResult', arrangeResult);
  } catch (error) {
    console.error(error);
  }
};

// export const startGroupControl = async (masterProcessId?: number, slaveProcessIds?: number[]) => {

// };

//Create a function that receives messages from the native plugin
// function controlActionCallback(action: SafeAny) {
//   console.log('controlActionCallback', action);
//// Process the action, such as sending it to the rendering process
//   ipcRenderer.send('control-action', action);
// }

//Pass functions to native plugins
// (windowAddon as unknown as SafeAny)!.setControlActionCallback(controlActionCallback);
