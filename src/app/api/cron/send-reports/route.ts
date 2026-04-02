import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase-server';
import { executeTool } from '@/lib/agents/tools';

// POST /api/cron/send-reports — Send scheduled reports
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    // Get active schedules
    const { data: schedules } = await supabase
      .from('report_schedules')
      .select('*')
      .eq('is_active', true);

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: 'No active schedules' });
    }

    const now = new Date();
    const currentDay = now.getDay() || 7; // 1=Mon, 7=Sun
    const currentHour = now.getHours();
    let sent = 0;

    for (const schedule of schedules) {
      // Check if this schedule should run now
      const [schedHour] = (schedule.time_of_day || '09:00').split(':').map(Number);
      let shouldRun = false;

      if (schedule.frequency === 'daily' && currentHour === schedHour) {
        shouldRun = true;
      } else if (schedule.frequency === 'weekly' && currentDay === (schedule.day_of_week || 1) && currentHour === schedHour) {
        shouldRun = true;
      } else if (schedule.frequency === 'monthly' && now.getDate() === 1 && currentHour === schedHour) {
        shouldRun = true;
      }

      if (!shouldRun) continue;

      // Don't send if already sent in the last 12 hours
      if (schedule.last_sent_at) {
        const lastSent = new Date(schedule.last_sent_at);
        if (now.getTime() - lastSent.getTime() < 12 * 60 * 60 * 1000) continue;
      }

      // Send the report
      const period = schedule.frequency === 'daily' ? 'today' : schedule.frequency === 'weekly' ? 'week' : 'month';
      const result = await executeTool('send_report', {
        recipients: schedule.recipients,
        report_type: schedule.report_type,
        period,
        subject: `${schedule.name} — ${new Date().toLocaleDateString()}`,
      });

      if (result.result && !result.result.includes('Failed')) {
        await supabase.from('report_schedules').update({
          last_sent_at: now.toISOString(),
        }).eq('id', schedule.id);
        sent++;
      }
    }

    return NextResponse.json({ success: true, sent, checked: schedules.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Report cron failed' },
      { status: 500 },
    );
  }
}
