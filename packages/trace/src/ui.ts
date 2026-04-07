/**
 * Lightweight UI/dashboard entrypoint for @zintrust/trace.
 *
 * Import this subpath when you only need trace dashboard registration
 * without pulling in the package root re-export surface.
 */

export { registerTraceDashboard, registerTraceRoutes } from './dashboard/routes';
export type { TraceDashboardOptions, TraceDashboardRegistrationOptions } from './dashboard/routes';
