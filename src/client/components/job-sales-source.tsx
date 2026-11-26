import { useEffect, useState } from 'preact/hooks';
import { accountRequest, useAccount } from '../auth';
import { useApp } from '../context';
import type { QuoteConversion } from '../quote-conversion-types';
import { Card, Notice } from './ui/surfaces';
import { Button } from './ui/button';
export function JobSalesSource({ jobId }: {
    jobId: string;
}) {
    const { user } = useAccount(), { navigate } = useApp();
    const [conversion, setConversion] = useState<QuoteConversion | null>(null), [error, setError] = useState('');
    useEffect(() => { if (!user || !['owner', 'admin', 'member'].includes(user.role))
        return; let live = true; setConversion(null); setError(''); void accountRequest<{
        conversion: QuoteConversion | null;
    }>(`/api/sales/converted-jobs/${jobId}`).then(d => { if (live)
        setConversion(d.conversion); }).catch(e => { if (live)
        setError(e.message); }); return () => { live = false; }; }, [jobId, user?.id, user?.role]);
    if (!conversion && !error)
        return null;
    return <Card><h2>Sales source</h2>{error && <Notice tone="warning">{error}</Notice>}{conversion && <><p>Created from accepted quote revision {conversion.revision}. Scope and price remain retained against the exact accepted offer.</p><div class="quote-actions"><Button onClick={() => navigate('/sales/quotes/' + conversion.quoteId)}>Open accepted quote</Button><Button onClick={() => navigate('/sales/' + conversion.opportunityId)}>Open opportunity</Button></div><p class="workspace-help">Internal Sales access is still required. Invoice and PO records link through this native Job / Work Order.</p></>}</Card>;
}
