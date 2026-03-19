import { createAdminClient } from "@/lib/supabase/admin";

export type AuditAction =
  | "project.created"
  | "project.updated"
  | "project.deleted"
  | "proposal.created"
  | "proposal.updated"
  | "proposal.deleted"
  | "proposal.converted"
  | "assignment.upserted"
  | "assignment.removed"
  | "leave_request.created"
  | "leave_request.status_changed"
  | "leave_request.deleted"
  | "user.role_changed"
  | "user.deactivated"
  | "user.reactivated"
  | "invitation.sent"
  | "invitation.accepted"
  | "invitation.revoked"
  | "org.settings_updated"
  | "office.created"
  | "office.updated"
  | "office.deleted";

type AuditParams = {
  tenantId: string;
  userId: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
};

/**
 * Write an audit log entry via the admin (service-role) client.
 * Failures are silently swallowed so they never block the main operation.
 */
export async function writeAuditLog(params: AuditParams): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from("audit_log").insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId ?? null,
      old_value: params.oldValue ?? null,
      new_value: params.newValue ?? null,
    });
  } catch {
    // Audit log writes must never break the main request
  }
}
