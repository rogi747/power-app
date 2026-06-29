import knex from 'knex';
import {app} from 'electron';
import {mkdirSync, existsSync} from 'fs';
import {DB_CONFIG} from '../constants';
import {WindowDB} from './window';
import {resetWindowStatus} from '../fingerprint';
import {join} from 'path';

// import {ProxyDB} from './proxy';
// import {GroupDB} from './group';
// import {TagDB} from './tag';

const db = knex(DB_CONFIG);

const initWindowStatus = async () => {
  const windows = await WindowDB.all();
  for (let index = 0; index < windows.length; index++) {
    const window = windows[index];
    if (window.status === 2) {
      await resetWindowStatus(window.id);
    }
  }
};

const initializeDatabase = async () => {
  const userDataPath = app.getPath('userData');

  //Make sure the directory exists
  if (!existsSync(userDataPath)) {
    mkdirSync(userDataPath, {recursive: true});
  }

  try {
    //Initialize database connection
    await db.raw('SELECT 1');

    //Run migration
    await db.migrate.latest({
      directory: app.isPackaged ? join(process.resourcesPath, 'app/migrations') : './migrations',
    });

    //Initialize window state
    await initWindowStatus();

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
};

export {db, initializeDatabase};
