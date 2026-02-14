export default `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>New Comment Notification</title>
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
        background: linear-gradient(180deg, rgba(168, 85, 247, 0.15), rgba(147, 51, 234, 0.08));
        border-bottom: 1px solid #334155;
      }

      .icon {
        width: 48px;
        height: 48px;
        margin: 0 auto 20px;
        border-radius: 12px;
        border: 1px solid rgba(168, 85, 247, 0.35);
        background: linear-gradient(180deg, rgba(168, 85, 247, 0.2), rgba(147, 51, 234, 0.1));
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

      .comment-card {
        margin-bottom: 30px;
        border-radius: 8px;
        overflow: hidden;
        background: rgba(15, 23, 42, 0.65);
        border: 1px solid #334155;
      }

      .comment-header {
        display: flex;
        align-items: center;
        padding: 20px;
        background: rgba(168, 85, 247, 0.12);
        border-bottom: 1px solid #334155;
      }

      .commenter-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: linear-gradient(135deg, #a855f7, #9333ea);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #ffffff;
        font-weight: 600;
        font-size: 16px;
      }

      .commenter-info {
        flex: 1;
        margin-left: 12px;
      }

      .commenter-name {
        font-weight: 600;
        color: #e2e8f0;
        font-size: 14px;
      }

      .comment-time {
        font-size: 12px;
        color: #64748b;
        margin-top: 4px;
      }

      .comment-content {
        flex: 1;
        margin-left: 12px;
        font-size: 14px;
        color: #e2e8f0;
        line-height: 1.6;
      }

      .comment-text {
        margin: 0 0 12px;
        font-size: 14px;
        color: #cbd5e1;
        line-height: 1.6;
      }

      .button-container {
        margin-bottom: 30px;
        text-align: center;
      }

      .view-comment-button {
        display: inline-block;
        padding: 14px 32px;
        background: linear-gradient(135deg, #a855f7, #9333ea);
        color: #ffffff;
        text-decoration: none;
        border-radius: 8px;
        font-weight: 600;
        font-size: 15px;
        border: 1px solid rgba(168, 85, 247, 0.5);
      }

      .divider {
        margin: 30px 0;
        border-top: 1px solid #334155;
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

      .footer a {
        color: #bae6fd;
        text-decoration: none;
      }
    </style>
  </head>
  <body>
    <div class="email-container">
      <!-- Header -->
      <div class="header">
        <div class="icon">
          <span style="font-size: 24px">💬</span>
        </div>
        <h1 class="title">New Comment</h1>
        <p class="subtitle">Someone commented on your post</p>
      </div>

      <!-- Main Content -->
      <div class="content">
        <p class="greeting">Hi <strong style="color: #e2e8f0">{{name}}</strong>,</p>

        <div class="comment-card">
          <div class="comment-header">
            <div class="commenter-avatar">{{commenterInitial}}</div>
            <div class="commenter-info">
              <div class="commenter-name">{{commenterName}}</div>
              <div class="comment-time">{{commentTime}}</div>
            </div>
          </div>

          <div class="comment-content">
            <p class="comment-text">{{commentText}}</p>
            <p style="margin: 0 0 12px; font-size: 14px; color: #cbd5e1; line-height: 1.6">
              <strong style="color: #e2e8f0">{{commenterName}}</strong> left a comment on your post
              "<strong style="color: #e2e8f0">{{postTitle}}</strong>".
            </p>
          </div>
        </div>

        <!-- CTA Button -->
        <div class="button-container">
          <a href="{{commentLink}}" class="view-comment-button">View Comment</a>
        </div>

        <!-- Divider -->
        <div class="divider"></div>

        <p style="margin: 0; font-size: 14px; color: #e2e8f0; line-height: 1.6">
          You're receiving this email because you enabled comment notifications.<br />
          <a href="{{unsubscribeLink}}" style="color: #bae6fd; text-decoration: none"
            >Manage notification settings</a
          >
        </p>
      </div>

      <!-- Footer -->
      <div class="footer">
        <p>&copy; {{year}} {{APP_NAME}}. All rights reserved.</p>
      </div>
    </div>
  </body>
</html>`;
