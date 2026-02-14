export default `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Welcome to {{APP_NAME}}</title>
    <style>
      body {
        margin: 0;
        padding: 0;
        background-color: #0b1220;
        font-family:
          -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      }

      .email-container {
        max-width: 600px;
        margin: 40px auto;
        background-color: #0f172a;
        border: 1px solid #334155;
        border-radius: 12px;
        overflow: hidden;
      }

      .header {
        padding: 40px 40px 30px;
        text-align: center;
        background: linear-gradient(180deg, rgba(14, 165, 233, 0.18), rgba(2, 132, 199, 0.1));
        border-bottom: 1px solid #334155;
      }

      .icon {
        width: 48px;
        height: 48px;
        margin: 0 auto 20px;
        border-radius: 12px;
        border: 1px solid rgba(14, 165, 233, 0.35);
        background: linear-gradient(180deg, rgba(14, 165, 233, 0.25), rgba(2, 132, 199, 0.15));
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .title {
        margin: 0 0 8px;
        font-size: 28px;
        font-weight: 700;
        color: #e2e8f0;
        line-height: 1.2;
      }

      .subtitle {
        margin: 0;
        font-size: 16px;
        color: #e2e8f0;
        line-height: 1.5;
      }

      .content {
        padding: 40px;
      }

      .greeting {
        margin: 0 0 20px;
        font-size: 15px;
        color: #e2e8f0;
        line-height: 1.6;
      }

      .message {
        margin: 0 0 20px;
        font-size: 15px;
        color: #e2e8f0;
        line-height: 1.6;
      }

      .cta-message {
        margin: 0 0 30px;
        font-size: 15px;
        color: #e2e8f0;
        line-height: 1.6;
      }

      .button-container {
        margin-bottom: 30px;
        text-align: center;
      }

      .get-started-button {
        display: inline-block;
        padding: 14px 32px;
        background: linear-gradient(135deg, #0369a1, #075985);
        color: #ffffff;
        text-decoration: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 15px;
        border: 1px solid rgba(3, 105, 161, 0.5);
      }

      .next-steps {
        margin-bottom: 20px;
      }

      .next-steps h3 {
        margin: 0 0 16px;
        font-size: 18px;
        font-weight: 700;
        color: #e2e8f0;
      }

      .steps-list {
        padding: 16px;
        background: rgba(14, 165, 233, 0.08);
        border-left: 3px solid #0ea5e9;
        border-radius: 6px;
      }

      .steps-list p {
        margin: 0;
        font-size: 14px;
        color: #e2e8f0;
        line-height: 1.8;
      }

      .footer {
        padding: 30px 40px;
        background: rgba(15, 23, 42, 0.65);
        border-top: 1px solid #334155;
        text-align: center;
      }

      .footer p {
        margin: 0;
        font-size: 12px;
        color: #64748b;
      }
    </style>
  </head>
  <body>
    <div class="email-container">
      <!-- Header -->
      <div class="header">
        <div class="icon">
          <span style="font-size: 24px">🎉</span>
        </div>
        <h1 class="title">Welcome to {{APP_NAME}}!</h1>
        <p class="subtitle">Your account has been successfully created</p>
      </div>

      <!-- Main Content -->
      <div class="content">
        <p class="greeting">Hello <strong style="color: #e2e8f0">{{name}}</strong>,</p>

        <p class="message">
          Thank you for joining {{APP_NAME}}! We're excited to have you on board.
        </p>

        <p class="cta-message">
          Your account is now active and you can start building with {{APP_NAME}}.
        </p>

        <!-- CTA Button -->
        <div class="button-container">
          <a href="{{action_url}}" class="get-started-button">Get Started</a>
        </div>

        <!-- Next Steps -->
        <div class="next-steps">
          <h3>What's Next?</h3>
          <div class="steps-list">
            <p>
              ✓ {{next_step_1}}<br />
              ✓ {{next_step_2}}<br />
              ✓ {{next_step_3}}
            </p>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>&copy; {{year}} {{APP_NAME}}. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>`;
