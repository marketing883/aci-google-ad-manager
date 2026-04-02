import { createLogger } from './utils/logger';

const logger = createLogger('Email');

// ============================================================
// Email Client — Resend API
// ============================================================

interface SendEmailParams {
  to: string[];
  subject: string;
  html: string;
  text?: string;
}

interface SendResult {
  success: boolean;
  id?: string;
  error?: string;
}

/**
 * Send an email via Resend API
 */
export async function sendEmail(params: SendEmailParams): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    logger.warn('RESEND_API_KEY not configured — email not sent');
    return { success: false, error: 'Email service not configured. Add RESEND_API_KEY to .env.local' };
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || 'ACI Ads <ads@aciinfotech.net>';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      logger.error('Email send failed', { error });
      return { success: false, error: error.message || `HTTP ${response.status}` };
    }

    const data = await response.json();
    logger.info('Email sent', { id: data.id, to: params.to });
    return { success: true, id: data.id };
  } catch (error) {
    logger.error('Email error', { error: (error as Error).message });
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Generate HTML for a performance report email
 */
export function generatePerformanceReportHtml(data: {
  period: string;
  metrics: {
    spend: string;
    clicks: string;
    conversions: string;
    ctr: string;
    cpa: string;
  };
  campaigns: Array<{ name: string; spend: string; conversions: string; health: string }>;
  recommendations: string[];
  generatedAt: string;
}): string {
  const campaignRows = data.campaigns.map((c) =>
    `<tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #333;">${c.name}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #333; text-align: right;">${c.spend}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #333; text-align: right;">${c.conversions}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #333; text-align: center;">${c.health}</td>
    </tr>`
  ).join('');

  const recommendationItems = data.recommendations.map((r) =>
    `<li style="margin-bottom: 8px; color: #ccc;">${r}</li>`
  ).join('');

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background: #0a0a0a; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 40px 20px;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h1 style="color: #60a5fa; font-size: 24px; margin-bottom: 8px;">ACI Ads — ${data.period} Report</h1>
    <p style="color: #888; font-size: 14px; margin-bottom: 24px;">Generated ${data.generatedAt}</p>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;">
      <div style="background: #1a1a2e; padding: 16px; border-radius: 8px;">
        <p style="color: #888; font-size: 12px; margin: 0;">Total Spend</p>
        <p style="font-size: 24px; font-weight: bold; margin: 4px 0 0;">${data.metrics.spend}</p>
      </div>
      <div style="background: #1a1a2e; padding: 16px; border-radius: 8px;">
        <p style="color: #888; font-size: 12px; margin: 0;">Conversions</p>
        <p style="font-size: 24px; font-weight: bold; margin: 4px 0 0;">${data.metrics.conversions}</p>
      </div>
      <div style="background: #1a1a2e; padding: 16px; border-radius: 8px;">
        <p style="color: #888; font-size: 12px; margin: 0;">CTR</p>
        <p style="font-size: 24px; font-weight: bold; margin: 4px 0 0;">${data.metrics.ctr}</p>
      </div>
      <div style="background: #1a1a2e; padding: 16px; border-radius: 8px;">
        <p style="color: #888; font-size: 12px; margin: 0;">CPA</p>
        <p style="font-size: 24px; font-weight: bold; margin: 4px 0 0;">${data.metrics.cpa}</p>
      </div>
    </div>

    ${data.campaigns.length > 0 ? `
    <h2 style="color: #fff; font-size: 16px; margin-bottom: 12px;">Campaign Performance</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px;">
      <thead>
        <tr style="color: #888;">
          <th style="padding: 8px 12px; text-align: left; border-bottom: 1px solid #333;">Campaign</th>
          <th style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #333;">Spend</th>
          <th style="padding: 8px 12px; text-align: right; border-bottom: 1px solid #333;">Conv.</th>
          <th style="padding: 8px 12px; text-align: center; border-bottom: 1px solid #333;">Health</th>
        </tr>
      </thead>
      <tbody>${campaignRows}</tbody>
    </table>
    ` : ''}

    ${data.recommendations.length > 0 ? `
    <h2 style="color: #fff; font-size: 16px; margin-bottom: 12px;">AI Recommendations</h2>
    <ul style="padding-left: 20px; margin-bottom: 24px;">${recommendationItems}</ul>
    ` : ''}

    <div style="border-top: 1px solid #333; padding-top: 16px; margin-top: 24px;">
      <p style="color: #666; font-size: 12px;">Sent by ACI Ads Manager — AI Command Center for Google Ads</p>
    </div>
  </div>
</body>
</html>`;
}
