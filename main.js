import { app } from 'electron';
import chokidar from 'chokidar';
import fs from 'fs';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const appPath = app.getAppPath();
const ignoredPaths = /node_modules|[/\\]\./;

// In ES modules, we don't have module.parent.filename
// Instead, we need to determine the main file differently
// This will get the file that imported this module
const getMainFilePath = () => {
  // Get the stack trace
  const stack = new Error().stack;
  // Parse the stack to find the caller file
  const callerFile = stack.split('\n')[2].match(/\((.*):\d+:\d+\)/)?.[1];
  
  // If we can't determine it from the stack trace, fall back to the importing module
  if (!callerFile) {
    // Try to use import.meta.url of the caller (may require passing it as a parameter)
    return process.argv[1] || process.mainModule?.filename;
  }
  
  return callerFile;
};

const mainFile = getMainFilePath();

/**
 * Creates a callback for hard resets.
 *
 * @param {string} eXecutable path to electron executable
 * @param {string} hardResetMethod method to restart electron
 * @param {string[]} eArgv arguments passed to electron
 * @param {string[]} aArgv arguments passed to the application
 * @returns {function} handler to pass to chokidar
 */
const createHardresetHandler = (eXecutable, hardResetMethod, eArgv, aArgv) =>
  () => {
    // Detaching child is useful when in Windows to let child
    // live after the parent is killed
    const args = (eArgv || [])
      .concat([appPath])
      .concat(aArgv || []);
    const child = spawn(eXecutable, args, {
      detached: true,
      stdio: 'inherit'
    });
    child.unref();
    // Kamikaze!

    // In cases where an app overrides the default closing or quiting actions
    // firing an `app.quit()` may not actually quit the app. In these cases
    // you can use `app.exit()` to gracefully close the app.
    if (hardResetMethod === 'exit') {
      app.exit();
    } else {
      app.quit();
    }
  };

export function electronReload(glob, options = {}) {
  const browserWindows = [];
  const watcher = chokidar.watch(glob, Object.assign({ ignored: [ignoredPaths, mainFile] }, options));

  // Callback function to be executed:
  // I) soft reset: reload browser windows
  const softResetHandler = () => browserWindows.forEach(bw => bw.webContents.reloadIgnoringCache());
  // II) hard reset: restart the whole electron process
  const eXecutable = options.electron;
  const hardResetHandler = createHardresetHandler(
    eXecutable,
    options.hardResetMethod,
    options.electronArgv,
    options.appArgv);

  // Add each created BrowserWindow to list of maintained items
  app.on('browser-window-created', (e, bw) => {
    browserWindows.push(bw);

    // Remove closed windows from list of maintained items
    bw.on('closed', function () {
      const i = browserWindows.indexOf(bw); // Must use current index
      browserWindows.splice(i, 1);
    });
  });

  // Enable default soft reset
  watcher.on('change', softResetHandler);

  // Preparing hard reset if electron executable is given in options
  // A hard reset is only done when the main file has changed
  if (eXecutable) {
    if (!fs.existsSync(eXecutable)) {
      throw new Error('Provided electron executable cannot be found or is not executable!');
    }

    const hardWatcher = chokidar.watch(mainFile, Object.assign({ ignored: [ignoredPaths] }, options));

    if (options.forceHardReset === true) {
      // Watch every file for hard reset and not only the main file
      hardWatcher.add(glob);
      // Stop our default soft reset
      watcher.close();
    }

    hardWatcher.once('change', hardResetHandler);
  }
}

export default electronReload;