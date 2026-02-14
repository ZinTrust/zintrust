export default `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Performance Report</title>
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
        background: linear-gradient(180deg, rgba(14, 165, 233, 0.15), rgba(2, 132, 199, 0.08));
        border-bottom: 1px solid #334155;
      }

      .icon {
        width: 48px;
        height: 48px;
        margin: 0 auto 20px;
        border-radius: 12px;
        border: 1px solid rgba(14, 165, 233, 0.35);
        background: linear-gradient(180deg, rgba(14, 165, 233, 0.2), rgba(2, 132, 199, 0.1));
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

      .summary {
        margin: 0 0 30px;
        font-size: 15px;
        color: #e2e8f0;
        line-height: 1.6;
      }

      .metrics-grid {
        display: flex;
        gap: 4%;
        margin-bottom: 20px;
      }

      .metric-card {
        flex: 1;
        padding: 20px;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid #334155;
        border-radius: 8px;
        text-align: center;
      }

      .metric-label {
        margin: 0 0 8px;
        font-size: 13px;
        color: #94a3b8;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        font-weight: 600;
      }

      .metric-value {
        margin: 0;
        font-size: 32px;
        font-weight: 700;
      }

      .metric-value.total {
        color: #bae6fd;
      }

      .metric-value.success {
        color: #22c55e;
      }

      .metric-value.failed {
        color: #fca5a5;
      }

      .metrics-table {
        margin-bottom: 30px;
        border-radius: 8px;
        overflow: hidden;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid #334155;
      }

      .metrics-table table {
        width: 100%;
        border-collapse: collapse;
      }

      .metrics-table th {
        padding: 10px 0;
        color: #94a3b8;
        font-size: 14px;
        border-bottom: 1px solid #334155;
        text-align: left;
      }

      .metrics-table td {
        padding: 12px 0;
        font-size: 14px;
        border-bottom: 1px solid rgba(51, 65, 85, 0.5);
      }

      .metrics-table .metric-name {
        color: #cbd5e1;
      }

      .metrics-table .metric-value-cell {
        color: #e2e8f0;
        font-weight: 500;
        text-align: right;
      }

      .metrics-table .metric-value-cell.failed {
        color: #fca5a5;
      }

      .button-container {
        margin-bottom: 30px;
        text-align: center;
      }

      .report-button {
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
          <span style="font-size: 24px">📊</span>
        </div>
        <h1 class="title">Performance Report</h1>
        <p class="subtitle">{{report_period}}</p>
      </div>

      <!-- Main Content -->
      <div class="content">
        <p class="greeting">Hi <strong style="color: #e2e8f0">{{name}}</strong>,</p>

        <p class="summary">Here's your worker performance summary for {{report_period}}:</p>

        <!-- Key Metrics -->
        <div class="metrics-grid">
          <div class="metric-card">
            <p class="metric-label">Total Jobs</p>
            <p class="metric-value total">{{total_jobs}}</p>
          </div>
          <div class="metric-card">
            <p class="metric-label">Success Rate</p>
            <p class="metric-value success">{{success_rate}}%</p>
          </div>
        </div>

        <!-- Detailed Metrics Table -->
        <div class="metrics-table">
          <table>
            <tr>
              <th>Metric</th>
              <th>Value</th>
            </tr>
            <tr>
              <td class="metric-name">Completed Jobs</td>
              <td class="metric-value-cell">{{completed_jobs}}</td>
            </tr>
            <tr>
              <td class="metric-name">Failed Jobs</td>
              <td class="metric-value-cell failed">{{failed_jobs}}</td>
            </tr>
            <tr>
              <td class="metric-name">Avg Processing Time</td>
              <td class="metric-value-cell">{{avg_processing_time}}</td>
            </tr>
            <tr>
              <td class="metric-name">Active Workers</td>
              <td class="metric-value-cell">{{active_workers}}</td>
            </tr>
          </table>
        </div>

        <!-- CTA Button -->
        <div class="button-container">
          <a href="{{dashboard_url}}" class="report-button">View Full Report</a>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>&copy; {{year}} {{APP_NAME}}. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>`;
