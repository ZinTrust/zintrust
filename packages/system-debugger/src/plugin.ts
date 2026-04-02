export type {};

type GlobalDebuggerPluginState = {
  __zintrust_system_debugger_plugin_requested__?: boolean;
};

const globalDebuggerPluginState = globalThis as unknown as GlobalDebuggerPluginState;

globalDebuggerPluginState.__zintrust_system_debugger_plugin_requested__ = true;
