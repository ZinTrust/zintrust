export interface INotificationDriver {
  send(recipient: string, message: string, options?: Record<string, unknown>): Promise<unknown>;
}

export type NotificationPayload = {
  recipient: string;
  message: string;
  options?: Record<string, unknown>;
};

export default {} as unknown as INotificationDriver;
