# Mail Templates

ZinTrust includes professional HTML email templates with modern dark theme design.

Email templates are:

- Pure HTML files optimized for email clients
- Table-based layouts for maximum compatibility
- Styled with inline styles (no external CSS)
- Using ZinTrust brand colors from the design system
- Variables are interpolated using `{{variable}}` placeholders

## Where templates live

All email templates are located in:

- `src/tools/mail/templates/` (HTML files)

## Available Templates

ZinTrust includes the following professionally-designed email templates:

### Authentication Templates

- **auth-welcome.html** - Welcome email for new users
  - Variables: `{{name}}`, `{{confirmLink}}`, `{{expiryMinutes}}`, `{{support_url}}`, `{{APP_NAME}}`
  - Design: Blue gradient header with icon badge

- **auth-password-reset.html** - Password reset emails
  - Variables: `{{name}}`, `{{email}}`, `{{reset_url}}`, `{{expiryMinutes}}`, `{{support_url}}`, `{{APP_NAME}}`, `{{year}}`
  - Design: Red/orange security theme with warning badges

### Notification Templates

- **notifications-new-comment.html** - New comment notifications
  - Variables: `{{name}}`, `{{commenterName}}`, `{{commenterInitial}}`, `{{commentText}}`, `{{commentTime}}`, `{{commentLink}}`, `{{postTitle}}`, `{{unsubscribeLink}}`, `{{APP_NAME}}`, `{{year}}`
  - Design: Purple theme with avatar placeholder

### Worker Management Templates

- **worker-alert.html** - Worker error/alert notifications
  - Variables: `{{name}}`, `{{alert_level}}`, `{{alert_message}}`, `{{worker_name}}`, `{{queue_name}}`, `{{job_id}}`, `{{timestamp}}`, `{{error_message}}`, `{{dashboard_url}}`, `{{APP_NAME}}`, `{{year}}`
  - Design: Red alert theme with gradient header

- **job-completed.html** - Job completion notifications
  - Variables: `{{name}}`, `{{job_id}}`, `{{worker_name}}`, `{{queue_name}}`, `{{processed_at}}`, `{{status}}`, `{{dashboard_url}}`, `{{APP_NAME}}`, `{{year}}`
  - Design: Green success theme

- **performance-report.html** - Performance metrics report
  - Variables: `{{name}}`, `{{report_period}}`, `{{total_jobs}}`, `{{success_rate}}`, `{{completed_jobs}}`, `{{failed_jobs}}`, `{{avg_processing_time}}`, `{{active_workers}}`, `{{dashboard_url}}`, `{{APP_NAME}}`, `{{year}}`
  - Design: Blue data-focused theme with metric cards

### General Templates

- **general.html** - Flexible generic template with brand color
  - Variables: `{{subject}}`, `{{headline}}`, `{{message}}`, `{{action_url}}`, `{{action_text}}`, `{{primary_color}}`, `{{APP_NAME}}`, `{{year}}`
  - Design: Modern dark theme with customizable brand color

- **welcome.html** - Generic welcome template
  - Variables: `{{name}}`, `{{email}}`, `{{action_url}}`, `{{next_step_1}}`, `{{next_step_2}}`, `{{next_step_3}}`, `{{APP_NAME}}`, `{{year}}`
  - Design: Modern dark theme with gradient elements

- **password-reset.html** - Alternative password reset template
  - Variables: `{{name}}`, `{{email}}`, `{{reset_url}}`, `{{expiryTime}}`, `{{APP_NAME}}`, `{{year}}`
  - Design: Red security-focused theme

## Using Templates

Import the Mail service and MailTemplateRenderer:

```ts
import { Mail, MailTemplateRenderer } from '@zintrust/core';

// Load and render a template
const templatePath = 'src/tools/mail/templates/auth-welcome.html';
const html = await MailTemplateRenderer.render(templatePath, {
  name: 'Alice',
  confirmLink: 'https://example.com/verify',
  expiryMinutes: 30,
});

// Send the email
await Mail.send({
  to: 'alice@example.com',
  subject: 'Welcome to ZinTrust!',
  html,
});
```

Or use the MailTemplates registry for convenient access:

```ts
import { MailTemplates, MailTemplateRenderer } from '@zintrust/core';

const tpl = MailTemplates.auth.welcome;
const rendered = MailTemplateRenderer.render(tpl, { name: 'Jane' });
```

## Design System

All templates follow the ZinTrust design system:

### Color Palette

- **Background**: `#0b1220` (dark blue-black)
- **Card Background**: `#0f172a` (slate-900)
- **Borders**: `#334155` (slate-700)
- **Text Primary**: `#e2e8f0` (slate-200)
- **Text Secondary**: `#cbd5e1` (slate-300)
- **Text Muted**: `#94a3b8` (slate-400)
- **Accent Blue**: `#0ea5e9`, `#bae6fd` (sky)
- **Success Green**: `#22c55e`
- **Error Red**: `#ef4444`
- **Warning Orange**: `#f59e0b`

### Layout Principles

- **Responsive**: 600px max-width with 40px padding
- **Table-based**: Using `<table role="presentation">` for email client compatibility
- **Inline styles**: All styles are inline to ensure rendering across clients
- **Gradient headers**: Each template features a themed gradient header
- **Icon badges**: Emoji icons in bordered gradient containers
- **Border radius**: 12px for cards, 8px for buttons
- **Spacing**: Consistent 40px padding, 30px margins

## Template Structure

All templates follow this structure:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Template Title</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #0b1220; ...">
    <table role="presentation" style="width: 100%; ...">
      <!-- Header with gradient and icon -->
      <!-- Body content with variables -->
      <!-- Footer with branding -->
    </table>
  </body>
</html>
```

## Variable Interpolation

All templates support the following system variables:

- `{{APP_NAME}}` - Application name from `.env` file (falls back to 'ZinTrust Framework' if not defined)
- `{{year}}` - Current year for copyright notices

Template-specific variables are interpolated using `{{variable}}` placeholders:

- `{{name}}` - User's name
- `{{email}}` - User's email
- `{{action_url}}` - Call-to-action URL
- etc.

Variables are HTML-escaped automatically to prevent XSS attacks.

### Using APP_NAME

All templates use `{{APP_NAME}}` for branding, allowing developers to customize the application name:

```env
# .env file
APP_NAME=MyAwesomeApp
```

The templates will automatically display "MyAwesomeApp" instead of "ZinTrust Framework" in:

- Email titles
- Header text
- Footer branding
- Body content references

### Copyright Notice

All templates include a copyright footer that uses:

```
© {{year}} {{APP_NAME}}. All rights reserved.
```

This automatically displays the current year and your application name.

## Previewing Templates During Development

You can render any email template in the browser without sending an email.

### Route-based preview

If you registered the example helper route:

```ts
registerMailUiPag(router);
```

Visit:

```
/mail/<template-name>
```

Example:

```
/mail/password-reset
```

The route calls `Mail.render()` internally and streams the raw HTML so you can inspect the final markup.

### Programmatic preview

```ts
import { Mail } from '@zintrust/core';

await Mail.send({
  to: 'bob@site.com',
  subject: 'Custom',
  html: await Mail.render({
    template: 'src/emails/my-brand.html', // absolute or relative path
    variables: {
      primary_color: '#ff0000',
      headline: 'Hi Bob',
      message: '...',
      action_url: 'https://example.com',
    },
  }),
});
```

---

## Email Client Compatibility

Templates are tested and optimized for:

- Gmail (web, iOS, Android)
- Outlook (desktop, web)
- Apple Mail
- Yahoo Mail
- ProtonMail
- Mobile email clients

Techniques used:

- Table-based layouts (not flexbox/grid)
- Inline styles (no external CSS)
- Web-safe fonts with fallbacks
- Conservative CSS properties
- No JavaScript or external resources
