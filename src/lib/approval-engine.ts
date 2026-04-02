import { createAdminClient } from './supabase-server';
import { createLogger } from './utils/logger';
import type { ApprovalQueueItem, ApprovalStatus } from '@/types';

const logger = createLogger('ApprovalEngine');

// ============================================================
// Approval Engine — State Machine for Campaign Changes
// ============================================================

// State transitions
const VALID_TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  pending: ['approved', 'rejected', 'expired'],
  approved: ['applied', 'failed'],
  rejected: [],
  applied: [],
  expired: [],
  failed: ['pending'], // can re-queue failed items
};

export class ApprovalEngine {
  private supabase = createAdminClient();

  /**
   * Create a new approval queue item
   */
  async enqueue(item: {
    action_type: string;
    entity_type: string;
    entity_id?: string;
    payload: Record<string, unknown>;
    previous_state?: Record<string, unknown>;
    ai_reasoning?: string;
    confidence_score?: number;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    agent_name?: string;
  }): Promise<ApprovalQueueItem> {
    const { data, error } = await this.supabase
      .from('approval_queue')
      .insert({
        ...item,
        status: 'pending',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to enqueue approval: ${error.message}`);

    logger.info(`Enqueued approval: ${item.action_type} for ${item.entity_type}`, {
      id: data.id,
      priority: item.priority || 'normal',
    });

    return data;
  }

  /**
   * Approve an item and optionally apply it
   */
  async approve(id: string, notes?: string, autoApply = true): Promise<ApprovalQueueItem> {
    const item = await this.getItem(id);
    this.validateTransition(item.status, 'approved');

    const { data, error } = await this.supabase
      .from('approval_queue')
      .update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewer_notes: notes,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to approve: ${error.message}`);

    logger.info(`Approved: ${id}`);

    // Auto-apply: try to push to Google Ads
    if (autoApply) {
      return this.apply(id);
    }

    return data;
  }

  /**
   * Reject an item
   */
  async reject(id: string, notes: string): Promise<ApprovalQueueItem> {
    const item = await this.getItem(id);
    this.validateTransition(item.status, 'rejected');

    const { data, error } = await this.supabase
      .from('approval_queue')
      .update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewer_notes: notes,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to reject: ${error.message}`);

    logger.info(`Rejected: ${id}`, { notes });
    return data;
  }

  /**
   * Edit the payload before approving
   */
  async editAndApprove(
    id: string,
    newPayload: Record<string, unknown>,
    notes?: string,
  ): Promise<ApprovalQueueItem> {
    const item = await this.getItem(id);
    this.validateTransition(item.status, 'approved');

    const { error } = await this.supabase
      .from('approval_queue')
      .update({
        payload: newPayload,
        reviewer_notes: notes || 'Edited before approval',
      })
      .eq('id', id);

    if (error) throw new Error(`Failed to edit approval: ${error.message}`);

    return this.approve(id, notes);
  }

  /**
   * Apply an approved change — push to database / Google Ads
   * This is where the actual campaign modifications happen.
   */
  async apply(id: string): Promise<ApprovalQueueItem> {
    const item = await this.getItem(id);

    if (item.status !== 'approved') {
      throw new Error(`Cannot apply item with status: ${item.status}`);
    }

    try {
      logger.info(`Applying: ${item.action_type} for ${item.entity_type}`, { id });

      // Route to Google Ads sync handler
      const { pushChangeToGoogle } = await import('./google-ads/sync');
      const result = await pushChangeToGoogle(
        item.action_type,
        item.payload as Record<string, unknown>,
      );

      if (!result.success) {
        throw new Error(result.error || 'Google Ads push failed');
      }

      logger.info(`Applied successfully: ${item.action_type}`, {
        google_resource: result.google_resource_name,
      });

      // Mark as applied
      const { data, error } = await this.supabase
        .from('approval_queue')
        .update({
          status: 'applied',
          applied_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      // Mark as failed
      const errMsg = error instanceof Error ? error.message : String(error);

      await this.supabase
        .from('approval_queue')
        .update({
          status: 'failed',
          error_message: errMsg,
        })
        .eq('id', id);

      logger.error(`Failed to apply: ${id}`, { error: errMsg });
      throw new Error(`Apply failed: ${errMsg}`);
    }
  }

  /**
   * Retry a failed item — sets back to approved and tries apply again
   */
  async retry(id: string): Promise<ApprovalQueueItem> {
    const item = await this.getItem(id);

    if (item.status !== 'failed') {
      throw new Error(`Can only retry failed items, current status: ${item.status}`);
    }

    // Set back to approved
    await this.supabase
      .from('approval_queue')
      .update({ status: 'approved', error_message: null })
      .eq('id', id);

    // Try apply again
    return this.apply(id);
  }

  /**
   * Bulk approve/reject
   */
  async bulkAction(
    ids: string[],
    action: 'approve' | 'reject',
    notes?: string,
  ): Promise<{ succeeded: string[]; failed: string[] }> {
    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const id of ids) {
      try {
        if (action === 'approve') {
          await this.approve(id, notes);
        } else {
          await this.reject(id, notes || 'Bulk rejected');
        }
        succeeded.push(id);
      } catch {
        failed.push(id);
      }
    }

    return { succeeded, failed };
  }

  /**
   * Expire old pending items
   */
  async expireOldItems(): Promise<number> {
    const { data, error } = await this.supabase
      .from('approval_queue')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())
      .select('id');

    if (error) {
      logger.error('Failed to expire items', { error: error.message });
      return 0;
    }

    const count = data?.length || 0;
    if (count > 0) {
      logger.info(`Expired ${count} approval items`);
    }
    return count;
  }

  // ---- Internal helpers ----

  private async getItem(id: string): Promise<ApprovalQueueItem> {
    const { data, error } = await this.supabase
      .from('approval_queue')
      .select()
      .eq('id', id)
      .single();

    if (error || !data) throw new Error(`Approval item not found: ${id}`);
    return data;
  }

  private validateTransition(from: ApprovalStatus, to: ApprovalStatus) {
    if (!VALID_TRANSITIONS[from]?.includes(to)) {
      throw new Error(`Invalid transition: ${from} → ${to}`);
    }
  }
}

// Singleton instance
export const approvalEngine = new ApprovalEngine();
