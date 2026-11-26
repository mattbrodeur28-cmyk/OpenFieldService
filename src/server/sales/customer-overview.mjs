import { z } from 'zod';
import { SalesError } from './domain.mjs';
/** Owning-module projection. Caller must hold the native database read snapshot. */
export function createSalesCustomerOverview({ storage, clock = () => new Date() }) {
    const db = storage.database;
    return function customerOverviewInTransaction(user, customerId) {
        if (!user?.active || user.mustChangePassword)
            throw new SalesError('Sign in to continue.', 401);
        if (!z.string().uuid().safeParse(customerId).success)
            throw new SalesError('Choose a valid customer.');
        const now = clock().toISOString();
        const summary = db.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(o.expected_value),0) AS value FROM _sales_opportunities o JOIN _sales_stages s ON s.id=o.stage_id WHERE o.customer_id=? AND s.kind='open'").get(customerId);
        const activities = db.prepare("SELECT a.id,a.opportunity_id AS opportunityId,o.title AS opportunityTitle,a.kind,a.title,a.status,a.assignee_id AS assigneeId,a.due_at AS dueAt,a.reminder_at AS reminderAt,a.completed_at AS completedAt FROM _sales_activities a JOIN _sales_opportunities o ON o.id=a.opportunity_id WHERE o.customer_id=? ORDER BY CASE WHEN a.status='open' THEN 0 ELSE 1 END,a.due_at,a.id LIMIT 10").all(customerId);
        const activityCounts = db.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN a.status='open' THEN 1 ELSE 0 END) AS open,SUM(CASE WHEN a.status='open' AND a.due_at<? THEN 1 ELSE 0 END) AS overdue FROM _sales_activities a JOIN _sales_opportunities o ON o.id=a.opportunity_id WHERE o.customer_id=?").get(now, customerId);
        const proposals = db.prepare('SELECT q.id,q.number,q.opportunity_id AS opportunityId,o.title AS opportunityTitle,q.version,q.status,q.updated_at AS updatedAt FROM _sales_quotes q JOIN _sales_opportunities o ON o.id=q.opportunity_id WHERE o.customer_id=? ORDER BY q.updated_at DESC,q.rowid DESC LIMIT 10').all(customerId).map(row => ({ ...row, identifier: 'Q-' + String(row.number).padStart(6, '0') }));
        const proposalTotal = db.prepare('SELECT COUNT(*) AS total FROM _sales_quotes q JOIN _sales_opportunities o ON o.id=q.opportunity_id WHERE o.customer_id=?').get(customerId).total;
        return { openOpportunities: summary.count, pipelineValue: summary.value, currency: 'USD', observedAt: now, activities: { rows: activities, total: activityCounts.total, open: activityCounts.open ?? 0, overdue: activityCounts.overdue ?? 0, limit: 10 }, proposals: { rows: proposals, total: proposalTotal, limit: 10, relationship: 'current_opportunity_customer' } };
    };
}
