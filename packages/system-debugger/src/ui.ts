/**
 * Lightweight UI/dashboard entrypoint for @zintrust/system-debugger.
 *
 * Import this subpath when you only need debugger dashboard registration
 * without pulling in the package root re-export surface.
 */

export { registerDebuggerDashboard, registerDebuggerRoutes } from './dashboard/routes';
export type {
  DebuggerDashboardOptions,
  DebuggerDashboardRegistrationOptions,
} from './dashboard/routes';
