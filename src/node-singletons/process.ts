/**
 * Node.js Process Module Singleton
 * Safe to import in both API and CLI code
 * Exported from node:process built-in
 */

import * as processModule from 'node:process';

export const {
  arch,
  argv,
  argv0,
  chdir,
  config,
  connected,
  cpuUsage,
  cwd,
  debugPort,
  disconnect,
  emitWarning,
  env,
  execArgv,
  execPath,
  exit,
  exitCode,
  getegid,
  geteuid,
  getgid,
  getgroups,
  getuid,
  hasUncaughtExceptionCaptureCallback,
  hrtime,
  kill,
  memoryUsage,
  nextTick,
  pid,
  platform,
  ppid,
  release,
  report,
  resourceUsage,
  setegid,
  seteuid,
  setgid,
  setgroups,
  setuid,
  setUncaughtExceptionCaptureCallback,
  stderr,
  stdin,
  stdout,
  title,
  umask,
  uptime,
  version,
  versions,
} = processModule;

export default processModule;
