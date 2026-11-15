export interface LaborInput {
  technicianId: string;
  startAt: string;
  endAt: string;
  breakMinutes: number;
  requestedBillableMinutes: number;
  workType: "work" | "travel" | "nonbillable";
  notes: string;
}
export interface PostWorkReport {
  timeZone: string;
  workPerformed: string;
  findings: string;
  deficiencies: string;
  followUp: string;
  visitStartAt: string;
  visitEndAt: string;
  entries: LaborInput[];
}
export interface EquipmentEvidence {
  id: string;
  name: string;
  serial_number: string;
  model: string;
  manufacturer: string;
  site_id: string;
  site_name: string;
}
export interface ReportRevision {
  equipment: EquipmentEvidence | null;
  id: string;
  revision: number;
  report: PostWorkReport;
  actor_id: string;
  technician_id: string;
  delegation_reason: string;
  late_entry_reason: string;
  submitted_at: string;
  decision: "approved" | "rejected" | null;
  review_notes: string | null;
  reviewer_id: string | null;
  reviewed_at: string | null;
}
export interface TimeEntry {
  id: string;
  report_id: string;
  technician_id: string;
  start_at: string;
  end_at: string;
  worked_minutes: number;
  break_minutes: number;
  requested_billable_minutes: number;
  work_type: string;
  state: string;
  notes: string;
}
export interface SafetyQuestion {
  key: string;
  label: string;
  kind: "text" | "ack";
  required: boolean;
}
export interface SafetyTemplate {
  template_id: string;
  revision: number;
  name: string;
  questions: SafetyQuestion[];
  approved_by: string;
  approved_at: string;
}
export interface ExecutionDetail {
  companyTimeZone: string;
  people: Record<string, string>;
  reportDraft?: {
    report: PostWorkReport;
    delegation_reason: string;
    late_entry_reason: string;
  } | null;
  reports?: ReportRevision[];
  timeEntries?: TimeEntry[];
  job: {
    id: string;
    identifier: string;
    status: string;
    technicianId: string | null;
    technicianName: string | null;
    equipmentId: string | null;
    equipment: EquipmentEvidence | null;
    scheduleVersion: number | null;
  };
  workflow: {
    job_id: string;
    template_id: string;
    template_revision: number;
    stage: "safety" | "post_work" | "review" | "complete";
    safety_id: string | null;
    version: number;
    estimate_json: string;
    service_completed: number;
    current_report_id?: string | null;
  } | null;
  template: SafetyTemplate | null;
  templates: SafetyTemplate[];
  draft: {
    answers: Record<string, string | boolean>;
    actor_id: string;
    technician_id: string;
    delegation_reason: string;
  } | null;
  safety: {
    id: string;
    answers: Record<string, string | boolean>;
    template: SafetyTemplate;
    actor_id: string;
    technician_id: string;
    delegation_reason: string;
    submitted_at: string;
  } | null;
  canManage: boolean;
  history: {
    id: number;
    actor_id: string;
    action: string;
    reason: string;
    created_at: string;
  }[];
}
