import { formatNumber } from '../utils/dataLoader';

function SummaryStats({ dashboardConfig }) {
  const summary = dashboardConfig?.data_summary || {};
  const thesis = dashboardConfig?.thesis || '';
  
  // Calculate average apparatus per incident
  const avgApparatus = summary.total_incidents 
    ? (summary.total_apparatus_dispatches / summary.total_incidents).toFixed(1)
    : '1.9';

  const stats = [
    { value: formatNumber(summary.total_incidents || 13988), label: 'Total Incidents' },
    { value: formatNumber(summary.total_apparatus_dispatches || 26287), label: 'Apparatus Dispatches' },
    { value: avgApparatus, label: 'Avg Apparatus/Incident' },
    { value: summary.months_analyzed || 21, label: 'Months Analyzed' },
    { value: summary.districts || 42, label: 'Districts' },
    { value: summary.stations || 7, label: 'Stations' },
  ];

  return (
    <div className="p-5">
      <div className="text-label uppercase text-secondary mb-4">System Overview</div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {stats.map((stat, idx) => (
          <div key={idx}>
            <div className="font-mono text-stat-md text-primary tabular-nums">
              {stat.value}
            </div>
            <div className="text-label uppercase text-secondary mt-0.5">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
      
      {/* Thesis Statement */}
      {thesis && (
        <div className="text-sm text-secondary/80 leading-relaxed pt-3 border-t border-border">
          {thesis}
        </div>
      )}
    </div>
  );
}

export default SummaryStats;
