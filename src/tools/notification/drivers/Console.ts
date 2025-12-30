export const ConsoleDriver = Object.freeze({
  async send(
    _recipient: string,
    _message: string,
    _options: Record<string, unknown> = {}
  ): Promise<{ ok: boolean }> {
    // Console driver is for development & simple systems — it should not throw
    // Keep implementation minimal and synchronous-friendly
    // Use out of band logging via ErrorHandler/Logger if required by callers
    // Here we simply return a small payload indicating success
    // Example: { ok: true }
    // NOTE: keep body small to avoid leaking test runner logs
    await Promise.resolve();
    return { ok: true };
  },
});

export default ConsoleDriver;
