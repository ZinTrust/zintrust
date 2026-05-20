declare module 'cloudflare:email' {
  // eslint-disable-next-line no-restricted-syntax, @typescript-eslint/no-extraneous-class
  export class EmailMessage {
    constructor(from: string, to: string, raw: string);
  }
}
