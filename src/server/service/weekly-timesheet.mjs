// Read projection over native report labor. No second time ledger or copied Job.
const addDate = (date, days) => new Date(Date.parse(date + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
export function weeklyTimesheet(entries, { weekStart, timeZone }) {
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    const local = instant => { const p = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(part => [part.type, part.value])); return `${p.year}-${p.month}-${p.day}`; };
    const days = Array.from({ length: 7 }, (_, i) => addDate(weekStart, i)), rows = new Map();
    const blank = () => ({ workedMinutes: 0, breakMinutes: 0, requestedBillableMinutes: 0, entryIds: [], needsDailyAllocation: false });
    for (const entry of entries) {
        let row = rows.get(entry.job_id);
        if (!row) {
            row = { jobId: entry.job_id, jobIdentifier: entry.job_identifier, days: days.map(date => ({ date, ...blank() })), ...blank(), unallocatedEntryIds: [], crossesWeek: false };
            rows.set(entry.job_id, row);
        }
        row.workedMinutes += entry.worked_minutes;
        row.breakMinutes += entry.break_minutes;
        row.requestedBillableMinutes += entry.requested_billable_minutes;
        row.entryIds.push(entry.id);
        const first = local(entry.start_at), last = local(Date.parse(entry.end_at) - 1);
        if (first === last && days.includes(first)) {
            const cell = row.days.find(day => day.date === first);
            cell.workedMinutes += entry.worked_minutes;
            cell.breakMinutes += entry.break_minutes;
            cell.requestedBillableMinutes += entry.requested_billable_minutes;
            cell.entryIds.push(entry.id);
        }
        else {
            row.unallocatedEntryIds.push(entry.id);
            row.crossesWeek ||= first < days[0] || last > days[6];
            for (const cell of row.days)
                if (cell.date >= first && cell.date <= last) {
                    cell.needsDailyAllocation = true;
                    cell.entryIds.push(entry.id);
                }
        }
    }
    const jobs = [...rows.values()].sort((a, b) => a.jobIdentifier.localeCompare(b.jobIdentifier) || a.jobId.localeCompare(b.jobId));
    return { weekStart, weekEnd: days[6], days, jobs, dayTotals: days.map((date, i) => ({ date, workedMinutes: jobs.reduce((n, row) => n + row.days[i].workedMinutes, 0), needsDailyAllocation: jobs.some(row => row.days[i].needsDailyAllocation) })), hasUnallocatedDays: jobs.some(row => row.unallocatedEntryIds.length > 0) };
}
