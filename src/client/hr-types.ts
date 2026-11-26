export interface StaffRecord {
    id: string;
    technician_id: string | null;
    name: string;
    email: string;
    phone: string;
    title: string;
    employment_status: 'active' | 'on_leave' | 'inactive' | 'terminated';
    technician_enabled: number;
    start_date: string;
    supervisor_id: string | null;
    supervisor_name: string | null;
    version: number;
    color: string | null;
    technician_active: number | null;
    user_id: string | null;
    open_jobs: number;
    created_at: string;
    updated_at: string;
}
export interface StaffList {
    rows: StaffRecord[];
    total: number;
    page: number;
    pageSize: number;
}
export interface StaffHistory {
    rows: {
        id: number;
        actorId: string;
        action: string;
        reason: string;
        createdAt: string;
        before: unknown;
        after: unknown;
    }[];
    page: number;
    hasMore: boolean;
}
