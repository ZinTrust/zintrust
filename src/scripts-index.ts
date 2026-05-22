/**
 * ZinTrust Scripts - Non-runtime entrypoint
 * Contains script utilities and generators for development/admin use
 */

// Note: These are standalone scripts that can be executed directly
// They don't export named functions but can be imported as modules
export * from '@/scripts/GenerateEnvArtifacts';
export * from '@/scripts/TemplateImportsCheck';
export * from '@/scripts/TemplateSync';
