import { databaseConfig } from './src/config/database';
import { Logger } from './src/config/logger';
import { useDatabase } from './src/orm/Database';
import { registerDatabasesFromRuntimeConfig } from './src/orm/DatabaseRuntimeRegistration';

async function test() {
  Logger.info('Starting test...');
  try {
    console.log('Registering databases...');
    registerDatabasesFromRuntimeConfig(databaseConfig);
    console.log('Registration complete.');

    console.log('Trying to use default database...');
    const db = useDatabase(undefined, 'default');
    console.log('Default database found:', db.isConnected());
  } catch (e) {
    console.error('Error:', e);
  }
}

test();
