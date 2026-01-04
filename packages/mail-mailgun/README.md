# @zintrust/mail-mailgun

Mailgun mail driver registration for Zintrust.

- Docs: https://zintrust.com/mail

## Install

```bash
npm i @zintrust/mail-mailgun
```

## Usage

```ts
import '@zintrust/mail-mailgun/register';
```

Then set `MAIL_DRIVER=mailgun` and configure `MAILGUN_API_KEY` + `MAILGUN_DOMAIN`.
