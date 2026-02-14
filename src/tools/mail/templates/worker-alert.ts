export default `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Worker Alert</title>
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
        background: linear-gradient(180deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.08));
        border-bottom: 1px solid #334155;
      }

      .icon {
        width: 48px;
        height: 48px;
        margin: 0 auto 20px;
        border-radius: 12px;
        border: 1px solid rgba(239, 68, 68, 0.35);
        background: linear-gradient(180deg, rgba(239, 68, 68, 0.2), rgba(220, 38, 38, 0.1));
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
        margin: 0 0 24px;
        font-size: 15px;
        color: #e2e8f0;
        line-height: 1.6;
      }

      .alert-box {
        margin-bottom: 30px;
        padding: 20px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 8px;
      }

      .alert-level {
        margin: 0 0 12px;
        font-size: 14px;
        font-weight: 700;
        color: #fca5a5;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }

      .alert-message {
        margin: 0;
        font-size: 16px;
        color: #e2e8f0;
        line-height: 1.6;
      }

      .details-table {
        margin-bottom: 30px;
        border-radius: 8px;
        overflow: hidden;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid #334155;
      }

      .details-table table {
        width: 100%;
        border-collapse: collapse;
      }

      .details-table th {
        padding: 8px 0;
        color: #94a3b8;
        font-size: 14px;
        border-bottom: 1px solid #334155;
        text-align: left;
      }

      .details-table td {
        padding: 8px 0;
        font-size: 14px;
        border-bottom: 1px solid rgba(51, 65, 85, 0.5);
      }

      .details-table .label {
        color: #94a3b8;
        width: 140px;
      }

      .details-table .value {
        color: #e2e8f0;
        font-weight: 500;
      }

      .details-table .value.error {
        color: #fca5a5;
        font-family: 'Courier New', monospace;
      }

      .details-table .value.monospace {
        font-family: 'Courier New', monospace;
      }

      .button-container {
        margin-bottom: 30px;
        text-align: center;
      }

      .view-details-button {
        display: inline-block;
        padding: 14px 32px;
        background: linear-gradient(135deg, #dc2626, #b91c1c);
        color: #ffffff;
        text-decoration: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 15px;
        border: 1px solid rgba(220, 38, 38, 0.5);
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
          <span style="font-size: 24px">⚠️</span>
        </div>
        <h1 class="title">Worker Alert</h1>
        <p class="subtitle">Action required for worker issue</p>
      </div>

      <!-- Main Content -->
      <div class="content">
        <p class="greeting">Hi <strong style="color: #e2e8f0">{{name}}</strong>,</p>

        <div class="alert-box">
          <p class="alert-level">{{alert_level}}</p>
          <p class="alert-message">{{alert_message}}</p>
        </div>

        <!-- Worker Details -->
        <div class="details-table">
          <table>
            <tr>
              <th class="label">Worker:</th>
              <td class="value">{{worker_name}}</td>
            </tr>
            <tr>
              <th class="label">Queue:</th>
              <td class="value">{{queue_name}}</td>
            </tr>
            <tr>
              <th class="label">Job ID:</th>
              <td class="value monospace">{{job_id}}</td>
            </tr>
            <tr>
              <th class="label">Timestamp:</th>
              <td class="value">{{timestamp}}</td>
            </tr>
            <tr>
              <th class="label">Error:</th>
              <td class="value error">{{error_message}}</td>
            </tr>
          </table>
        </div>

        <!-- CTA Button -->
        <div class="button-container">
          <a href="{{dashboard_url}}" class="view-details-button">View Details</a>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>&copy; {{year}} {{APP_NAME}}. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>`;
