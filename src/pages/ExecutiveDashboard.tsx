import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { ReadinessRing } from "@/components/ReadinessRing";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useEmployees, useAlgorithmResults, useInterviews, useReorgMatches, useAllEmployeeSkills, useRoles } from "@/hooks/useData";
import { Users, AlertTriangle, MessageSquare, UserPlus, Inbox, Zap, Filter } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Legend, BarChart, Bar, Cell } from "recharts";
import { useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function ExecutiveDashboard() {
  const { data: employees, isLoading: loadingEmp } = useEmployees();
  const { data: results } = useAlgorithmResults();
  const { data: interviews } = useInterviews();
  const { data: reorgMatches } = useReorgMatches();
  const { data: allSkills } = useAllEmployeeSkills();
  const { data: roles } = useRoles();
  const navigate = useNavigate();

  const avgReadiness = useMemo(() => {
    if (!results?.length) return 0;
    const withScore = results.filter(r => {
      const tls = (r as any).three_layer_score;
      return tls != null || r.final_readiness != null;
    });
    if (!withScore.length) return 0;
    return Math.round(
      (withScore.reduce((s, r) => {
        const tls = (r as any).three_layer_score;
        return s + (tls != null ? tls : (r.final_readiness || 0));
      }, 0) / withScore.length) * 100
    );
  }, [results]);

  const criticalGaps = useMemo(() => {
    if (!results?.length) return 0;
    return results.reduce((count, r) => {
      const ga = r.gap_analysis as any;
      if (ga?.criticalGaps) {
        return count + ga.criticalGaps.filter((g: any) => g.priority === 'critical').length;
      }
      return count;
    }, 0);
  }, [results]);

  const completedInterviews = interviews?.filter(i => i.status === 'completed').length || 0;
  const immediateMatches = reorgMatches?.filter(m => m.immediate_readiness).length || 0;

  const { data: externalCandidates } = useQuery({
    queryKey: ["external_candidates_dashboard"],
    queryFn: async () => {
      const { data, error } = await supabase.from("external_candidates").select("id, interview_worthy, status, submission_source, manager_decision, name, role_id, submitted_at, worthy_score");
      if (error) throw error;
      return data;
    },
  });
  const externalWorthyCount = externalCandidates?.filter((c: any) => c.interview_worthy).length || 0;
  const pendingReviewCount = externalCandidates?.filter((c: any) => c.submission_source === "candidate_self_submit" && c.manager_decision === "pending" && c.interview_worthy).length || 0;

  // Decision Velocity: complete assessments in last 30 days
  const { decisionVelocity, velocityBars } = useMemo(() => {
    if (!results?.length) return { decisionVelocity: 0, velocityBars: [] };
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const recentResults = results.filter(r => {
      const t = r.computed_at ? new Date(r.computed_at).getTime() : 0;
      return t >= thirtyDaysAgo;
    });
    // Daily bars for last 7 days
    const bars = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      const count = results.filter(r => {
        const t = r.computed_at ? new Date(r.computed_at).getTime() : 0;
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      }).length;
      bars.push({ day: i, count });
    }
    return { decisionVelocity: recentResults.length, velocityBars: bars };
  }, [results]);

  // Pipeline Conversion
  const pipelineConversion = useMemo(() => {
    if (!externalCandidates?.length) return 0;
    const worthy = externalCandidates.filter((c: any) => c.interview_worthy).length;
    return Math.round((worthy / externalCandidates.length) * 100);
  }, [externalCandidates]);

  const radarData = useMemo(() => {
    const strategicSkills = ['ThermalEngineering', 'Python', 'MachineLearning', 'EVBatterySystems', 'AUTOSAR', 'ProjectManagement', 'DeepLearning', 'ManufacturingProcesses'];
    if (!allSkills?.length || !roles?.length) return [];

    return strategicSkills.map(skill => {
      const skillEntries = allSkills.filter(s => s.skill_name === skill);
      const avgProf = skillEntries.length ? skillEntries.reduce((s, e) => s + (e.proficiency || 0), 0) / skillEntries.length : 0;
      const maxRequired = Math.max(0, ...roles.map(r => {
        const req = r.required_skills as any;
        return req?.[skill] || 0;
      }));
      return { skill: skill.replace(/([A-Z])/g, ' $1').trim(), workforce: Math.round(avgProf * 33.3), strategic: Math.round(maxRequired * 33.3) };
    });
  }, [allSkills, roles]);

  if (loadingEmp) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Executive Dashboard" subtitle="Workforce intelligence overview" />
      <div className="p-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard icon={Users} label="Employees Profiled" value={employees?.length || 0} subtitle="Full HR + interview data" color="blue" />
          <StatCard icon={AlertTriangle} label="Critical Skill Gaps" value={criticalGaps} subtitle="Require immediate action" color="red" />
          <StatCard icon={MessageSquare} label="Interviews Completed" value={completedInterviews} subtitle="Employee + manager combined" color="blue" />
          <StatCard icon={UserPlus} label="External Pipeline" value={externalWorthyCount} subtitle="Interview-worthy candidates" color="purple" />
          <StatCard icon={Inbox} label="Pending Review" value={pendingReviewCount} subtitle="Self-submitted, AI-cleared" color="amber" />
          {/* Decision Velocity */}
          <div className="card-skillsight p-5 animate-fade-in">
            <div className="flex items-start justify-between">
              <div className="w-9 h-9 rounded-full flex items-center justify-center bg-bmw-blue/10">
                <Zap className="h-[18px] w-[18px] text-bmw-blue" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-[13px] font-medium text-muted-foreground">Decision Velocity</p>
              <p className="text-[28px] font-bold font-mono leading-tight mt-0.5">{decisionVelocity}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Assessments completed — last 30 days</p>
              <div className="mt-2">
                <ResponsiveContainer width="100%" height={40}>
                  <BarChart data={velocityBars} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                      {velocityBars.map((_, idx) => (
                        <Cell key={idx} fill="hsl(213, 77%, 47%)" />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Pipeline Conversion standalone card */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard icon={Filter} label="Pipeline Conversion" value={`${pipelineConversion}%`} subtitle="External CVs cleared AI screening" color="green" />
        </div>

        {/* Main content 60/40 split */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left column */}
          <div className="lg:col-span-3 space-y-6">
            {/* Radar Chart */}
            <div className="card-skillsight p-5">
              <h3 className="text-[15px] font-semibold mb-4">Skill Coverage vs Strategic Requirements</h3>
              {radarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="skill" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <Radar name="Current Workforce" dataKey="workforce" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                    <Radar name="Strategic Need" dataKey="strategic" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.2} strokeDasharray="5 5" />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">No skill data available</p>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Internal Reorg Opportunity */}
            <div className="card-skillsight p-5">
              <h3 className="text-[15px] font-semibold mb-4">Internal Reorg Opportunity</h3>
              {roles?.map(role => (
                <div key={role.id} className="mb-3 cursor-pointer" onClick={() => navigate('/reorg')}>
                  <p className="text-xs font-medium mb-1">{role.title}</p>
                  <div className="flex gap-0.5 h-3 rounded-full overflow-hidden bg-secondary">
                    <div className="bg-status-green rounded-l-full" style={{ width: '10%' }} />
                    <div className="bg-primary" style={{ width: '20%' }} />
                    <div className="bg-status-amber rounded-r-full" style={{ width: '30%' }} />
                  </div>
                </div>
              ))}
              <div className="flex gap-4 mt-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-status-green" />≥80%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-primary" />60-79%</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-status-amber" />40-59%</span>
              </div>
            </div>

            {/* Recent Assessments */}
            <div className="card-skillsight p-5">
              <h3 className="text-[15px] font-semibold mb-4">Recent Assessments</h3>
              {results?.length ? results.slice(0, 5).map((r, i) => {
                const emp = employees?.find(e => e.id === r.employee_id);
                const role = roles?.find(ro => ro.id === r.role_id);
                if (!emp) return null;
                const tls = (r as any).three_layer_score;
                const displayScore = tls != null ? Math.round(tls * 100) : Math.round((r.final_readiness || 0) * 100);
                return (
                  <div key={r.id} className={`flex items-center gap-3 py-3 cursor-pointer hover:bg-accent/50 rounded-md px-1 ${i > 0 ? 'border-t border-border' : ''}`}
                    onClick={() => navigate(`/analysis/${emp.id}`)}>
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground shrink-0" style={{ backgroundColor: emp.avatar_color || 'hsl(213, 77%, 47%)' }}>
                      {emp.avatar_initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{emp.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{role?.title || 'Unknown role'}</p>
                    </div>
                    <ReadinessRing value={displayScore} size="sm" />
                  </div>
                );
              }) : (
                <p className="text-xs text-muted-foreground text-center py-4">No assessments yet</p>
              )}
            </div>

            {/* Pending Applications */}
            <div className="card-skillsight p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                <h3 className="text-[15px] font-semibold">New Applications — Pending Your Review</h3>
              </div>
              {pendingReviewCount > 0 ? (
                externalCandidates
                  ?.filter((c: any) => c.submission_source === "candidate_self_submit" && c.manager_decision === "pending" && c.interview_worthy)
                  .slice(0, 3)
                  .map((c: any) => {
                    const role = roles?.find(r => r.id === c.role_id);
                    const hoursAgo = Math.round((Date.now() - new Date(c.submitted_at || c.created_at).getTime()) / 3600000);
                    return (
                      <div key={c.id} className="flex items-center gap-3 py-2 border-t border-border first:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground">{role?.title} · {hoursAgo}h ago</p>
                        </div>
                        {c.worthy_score != null && (
                          <div className="h-1.5 w-16 rounded-full bg-secondary overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(c.worthy_score * 100)}%` }} />
                          </div>
                        )}
                        <button
                          onClick={() => navigate("/employees?tab=external&filter=pending")}
                          className="text-[10px] text-primary font-medium hover:underline"
                        >
                          Review
                        </button>
                      </div>
                    );
                  })
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">No new applications awaiting review.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}