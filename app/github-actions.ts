"use server";
// Compatibility aliases for existing callers; all lifecycle work is platform-owned.
export {syncIntegration as syncGitHub,disconnectIntegration as disconnectGitHub} from "./integration-actions";
