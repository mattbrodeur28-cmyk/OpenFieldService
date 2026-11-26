import { useState } from "preact/hooks";
import { PersonnelDocumentsDialog } from "./personnel-documents";
import { useAccount, canManagePeople } from '../auth';
import { useApp } from '../context';
import { Button } from './ui/button';
import { Badge, Table, EmptyState } from './ui/surfaces';
export function TechnicianList() {
    const [documents, setDocuments] = useState<{
        id: string;
        name: string;
    } | null>(null);
    const { user } = useAccount(), { technicians, navigate } = useApp();
    return <div class="page"><header class="page-header"><h1>Technicians</h1>{canManagePeople(user) && <Button onClick={() => navigate('/hr/staff')}>Manage staff in HR</Button>}</header><p class="workspace-help">Technician profiles and field availability are managed in HR → Staff. This view shows the same native resources used by Dispatcher, jobs and timecards.</p>{technicians.length ? <Table label="Field Service technicians"><thead><tr><th>Color</th><th>Name</th><th>Email</th><th>Phone</th><th>Open jobs</th><th>Availability</th>{canManagePeople(user) && <th>Personnel</th>}</tr></thead><tbody>{technicians.map(t => <tr key={t.id}><td><span class="color-swatch" style={{ background: t.color }}/></td><th scope="row">{t.name}</th><td>{t.email || '—'}</td><td>{t.phone || '—'}</td><td>{t.job_count ?? 0}</td><td><Badge tone={t.active ? 'success' : 'neutral'}>{t.active ? 'Available' : 'Unavailable'}</Badge></td>{canManagePeople(user) && <td><Button onClick={() => setDocuments({ id: t.id, name: t.name })}>Documents</Button></td>}</tr>)}</tbody></Table> : <EmptyState title="No technicians yet">Create a staff member and enable field technician availability through HR → Staff.</EmptyState>}{documents && <PersonnelDocumentsDialog staffId={documents.id} name={documents.name} close={() => setDocuments(null)}/>}</div>;
}
