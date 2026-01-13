# @zintrust/mail-nodemailer

Nodemailer mail driver package for Zintrust.

## Install

```bash
npm i @zintrust/mail-nodemailer nodemailer
```

## Usage

Register the driver at startup:

```ts
import '@zintrust/mail-nodemailer/register';
```

Then select the driver in your config/env:

```env
MAIL_DRIVER=nodemailer
```

## Docs

- https://zintrust.com/mail

## License

This package and its dependencies are MIT licensed, permitting free commercial use.
