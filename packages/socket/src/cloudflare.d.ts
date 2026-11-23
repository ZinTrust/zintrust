declare global {
  interface WebSocket {
    serializeAttachment(attachment: unknown): void;
    deserializeAttachment(): unknown | null;
  }
}

export {};