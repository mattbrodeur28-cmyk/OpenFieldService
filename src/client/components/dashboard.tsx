import { AnimatedNumber } from "./ui/animated-number";
import { ScheduleView } from "./schedule-view";
import { useApp } from "../context";
import { Briefcase, Users, CalendarCheck, DollarSign, Clock, CheckCircle, FileText, AlertCircle } from "lucide-preact";

export function Dashboard() {
  const { stats, navigate } = useApp();

  return (
    <div class="page">
      <div class="page-header">
        <h1>Dashboard</h1>
      </div>

      <div class="stats-grid">
        <button class="stat-card" onClick={() => navigate("/jobs")}>
          <div class="stat-icon">
            <Briefcase size={20} />
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber value={stats.jobs} /></div>
            <div class="stat-label">Total Jobs</div>
          </div>
        </button>
        <button class="stat-card" onClick={() => navigate("/customers")}>
          <div class="stat-icon">
            <Users size={20} />
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber value={stats.customers} /></div>
            <div class="stat-label">Customers</div>
          </div>
        </button>
        <button class="stat-card" onClick={() => navigate("/schedule")}>
          <div class="stat-icon">
            <Clock size={20} />
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber value={stats.today_jobs} /></div>
            <div class="stat-label">Today's Jobs</div>
          </div>
        </button>
        <div class="stat-card">
          <div class="stat-icon">
            <CalendarCheck size={20} />
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber value={stats.upcoming_jobs} /></div>
            <div class="stat-label">Upcoming</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">
            <CheckCircle size={20} />
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber value={stats.completed_jobs} /></div>
            <div class="stat-label">Completed</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">
            <DollarSign size={20} />
          </div>
          <div class="stat-info">
            <div class="stat-value">${stats.revenue.toLocaleString()}</div>
            <div class="stat-label">Completed job value</div>
          </div>
        </div>
        <button class="stat-card" onClick={() => navigate("/invoices")}>
          <div class="stat-icon">
            <FileText size={20} />
          </div>
          <div class="stat-info">
            <div class="stat-value"><AnimatedNumber value={stats.invoices_outstanding} /></div>
            <div class="stat-label">Outstanding Invoices</div>
          </div>
        </button>
        {stats.invoices_overdue > 0 && (
          <button class="stat-card" onClick={() => navigate("/invoices")}>
            <div class="stat-icon">
              <AlertCircle size={20} />
            </div>
            <div class="stat-info">
              <div class="stat-value"><AnimatedNumber value={stats.invoices_overdue} /></div>
              <div class="stat-label">Overdue</div>
            </div>
          </button>
        )}
      </div>

      <ScheduleView embedded allowCreate={false} title="Weekly overview" />
    </div>
  );
}
