export default `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{subject}}</title>
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
        border-bottom: 1px solid #334155;
        background: radial-gradient(circle at top, rgba(51, 65, 85, 0.2), transparent 70%);
      }

      .headline {
        margin: 0 0 16px;
        font-size: 28px;
        font-weight: 700;
        color: #e2e8f0;
        line-height: 1.25;
      }

      .content {
        padding: 40px;
        color: #94a3b8;
        font-size: 16px;
        line-height: 1.6;
      }

      .message {
        margin: 0 0 24px;
        color: #cbd5e1;
      }

      .button-container {
        text-align: center;
        margin-top: 32px;
        margin-bottom: 16px;
      }

      .button {
        display: inline-block;
        padding: 12px 32px;
        background-color: {{primary_color}};
        color: #ffffff;
        text-decoration: none;
        border-radius: 8px;
        font-weight: 600;
        transition: opacity 0.2s;
        border: 1px solid rgba(255, 255, 255, 0.1);
      }

      .button:hover {
        opacity: 0.9;
      }

      .footer {
        padding: 30px;
        background-color: #0b1220;
        border-top: 1px solid #1e293b;
        text-align: center;
      }

      .copyright {
        font-size: 13px;
        color: #64748b;
        margin: 0;
      }
    </style>
  </head>
  <body>
    <div class="email-container">
      <div class="header">
        <h1 class="headline" style="color: {{primary_color}}">{{headline}}</h1>
      </div>

      <div class="content">
        <div class="message">{{message}}</div>

        {{#if_action_url}}
        <div class="button-container">
          <a href="{{action_url}}" class="button">{{action_text}}</a>
        </div>
        {{/if_action_url}}
      </div>

      <div class="footer">
        <p class="copyright">© {{year}} {{APP_NAME}}. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>`;
