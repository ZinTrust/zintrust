import type { IDatabase } from '@orm/Database';

export type SeederModule = {
  /** Common pattern: export const UserSeeder = { run() { ... } } */
  [key: string]: unknown;
  /** Alternative: export const seeder = { run() { ... } } */
  seeder?: unknown;
  /** Alternative: export async function run() { ... } */
  run?: unknown;
  /** Interop: export default { run() { ... } } */
  default?: unknown;
};

export type SeederHandler = (db: IDatabase) => Promise<void>;

export type LoadedSeeder = {
  name: string;
  filePath: string;
  run: SeederHandler;
};
