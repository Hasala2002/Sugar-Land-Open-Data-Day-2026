import { getStrainColor } from '../utils/dataLoader';

function RecommendationsPanel({ dashboardConfig }) {
  // Get recommendations from config or use defaults
  const recommendations = dashboardConfig?.recommendations || [
    {
      severity: 'high',
      text: 'Station 3 needs capacity relief — its districts average 49.5% cross-district deployment.',
    },
    {
      severity: 'medium',
      text: 'Boundary zones (3M2, 3S1, 1S1) are chronic strain points — consider a dedicated swing unit.',
    },
    {
      severity: 'medium',
      text: 'District 609 (US-90 corridor) has 70% cross-district rate for MVAs — evaluate highway pre-positioning.',
    },
  ];

  // Map severity to strain color
  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'high':
        return '#ef4444';
      case 'medium':
        return '#eab308';
      case 'low':
        return '#22c55e';
      default:
        return '#eab308';
    }
  };

  return (
    <div className="p-5">
      <div className="text-label uppercase text-secondary mb-3">Recommendations</div>
      
      <div className="space-y-3">
        {recommendations.map((rec, idx) => (
          <div key={idx} className="flex gap-3">
            <div 
              className="w-2 h-2 rounded-full mt-1.5 shrink-0"
              style={{ background: getSeverityColor(rec.severity) }}
            />
            <p className="text-sm text-primary/80 leading-relaxed">
              {rec.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RecommendationsPanel;
