export type {};

type GlobalTracePluginState = {
  __zintrust_system_trace_plugin_requested__?: boolean;
};

const globalTracePluginState = globalThis as unknown as GlobalTracePluginState;

globalTracePluginState.__zintrust_system_trace_plugin_requested__ = true;
