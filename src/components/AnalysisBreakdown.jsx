import { formatNumber, formatPercent } from '../utils/dataLoader';

function MetricBlock({ label, value, sublabel }) {
  return (
    <div className="flex flex-col">
      <span className="text-label uppercase text-secondary text-xs tracking-wide mb-0.5">
        {label}
      </span>
      <span className="font-mono text-stat-sm text-primary tabular-nums">
        {value}
      </span>
      {sublabel && (
        <span className="text-[11px] text-secondary/60">{sublabel}</span>
      )}
    </div>
  );
}

function BarRow({ label, value, max, formatter = (v) => v }) {
  const width = max ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-secondary">
        <span className="truncate">{label}</span>
        <span className="font-mono text-primary/80 tabular-nums">
          {formatter(value)}
        </span>
      </div>
      <div className="h-1.5 bg-border/40 rounded">
        <div
          className="h-full rounded bg-strain-medium/80 transition-all duration-300"
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

function AnalysisBreakdown({ analysisResults }) {
  if (!analysisResults) return null;

  const { correlation_analysis, seasonal_analysis, district_analysis } = analysisResults;
  const mainCorrelation = correlation_analysis?.main_correlation;
  const correlationHighlights = (correlation_analysis?.monthly_correlations || []).slice(0, 3);
  const seasonalExtremes = seasonal_analysis?.extreme_months;
  const quarterly = seasonal_analysis?.quarterly_data || [];
  const topDistricts = (district_analysis?.top_strain_districts || []).slice(0, 5);
  const stationExports = (district_analysis?.station_export_rankings || []).slice(0, 3);

  const highestQuarterRate = Math.max(...quarterly.map((q) => q.avgCrossDistrict), 0.01);
  const highestDistrictRate = Math.max(...topDistricts.map((d) => d.cross_district_rate || 0), 0.01);
  const highestStationRate = Math.max(...stationExports.map((s) => s.avgCrossDistrictRate || 0), 0.01);

  return (
    <div className="p-5 space-y-6">
      <div>
        <div className="text-label uppercase text-secondary mb-3">Cross-District Thesis</div>
        <div className="grid grid-cols-2 gap-4">
          <MetricBlock
            label="Signal Strength"
            value={mainCorrelation?.signal_strength || 'Weak'}
            sublabel={mainCorrelation?.significant ? 'Statistically significant' : 'Not significant'}
          />
          <MetricBlock
            label="Correlation (r)"
            value={mainCorrelation ? mainCorrelation.r.toFixed(2) : '—'}
            sublabel={mainCorrelation ? `${mainCorrelation.name}` : 'No pairing'}
          />
          <MetricBlock
            label="r²"
            value={mainCorrelation ? mainCorrelation.rSquared.toFixed(2) : '—'}
            sublabel="Variance explained"
          />
          <MetricBlock
            label="p-value"
            value={mainCorrelation ? mainCorrelation.pValue.toFixed(2) : '—'}
            sublabel={mainCorrelation?.significant ? 'Reject H₀' : 'Retain H₀'}
          />
        </div>
      </div>

      {correlationHighlights.length > 0 && (
        <div>
          <div className="text-label uppercase text-secondary mb-3">Correlation Scan</div>
          <div className="space-y-3">
            {correlationHighlights.map((corr) => (
              <div key={corr.name} className="p-3 rounded border border-border/60 bg-surface/50">
                <div className="text-sm text-primary mb-1">{corr.name}</div>
                <div className="flex items-center justify-between text-xs text-secondary">
                  <span>n={corr.n}</span>
                  <span>r={corr.r.toFixed(2)}</span>
                  <span>p={corr.pValue.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {quarterly.length > 0 && (
        <div>
          <div className="text-label uppercase text-secondary mb-3">Seasonal Pulse</div>
          <div className="space-y-3">
            {quarterly.map((qtr) => (
              <BarRow
                key={qtr.quarter}
                label={`${qtr.quarter} • ${formatNumber(qtr.totalIncidents)} incidents`}
                value={qtr.avgCrossDistrict}
                max={highestQuarterRate}
                formatter={(val) => formatPercent(val * 100, 1)}
              />
            ))}
          </div>
          {seasonalExtremes && (
            <div className="grid grid-cols-2 gap-3 mt-4 text-[11px] text-secondary/80">
              <div>
                <div className="uppercase text-label mb-1">Low Strain Month</div>
                <div className="font-mono text-primary">
                  {seasonalExtremes.lowest_cross_district.month}
                </div>
                <div>{formatPercent(seasonalExtremes.lowest_cross_district.value * 100, 1)}</div>
              </div>
              <div>
                <div className="uppercase text-label mb-1">High Strain Month</div>
                <div className="font-mono text-primary">
                  {seasonalExtremes.highest_cross_district.month}
                </div>
                <div>{formatPercent(seasonalExtremes.highest_cross_district.value * 100, 1)}</div>
              </div>
            </div>
          )}
        </div>
      )}

      {topDistricts.length > 0 && (
        <div>
          <div className="text-label uppercase text-secondary mb-3">Top Strain Districts</div>
          <div className="space-y-3">
            {topDistricts.map((district) => (
              <div key={district.district} className="text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-primary">{district.district}</span>
                  <span className="text-secondary text-xs">{district.home_station.replace('Sugar Land Fire ', '')}</span>
                </div>
                <BarRow
                  label={`${formatNumber(district.total_incidents)} incidents`}
                  value={district.cross_district_rate}
                  max={highestDistrictRate}
                  formatter={(val) => formatPercent(val * 100, 1)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {stationExports.length > 0 && (
        <div>
          <div className="text-label uppercase text-secondary mb-3">Station Export Load</div>
          <div className="space-y-3">
            {stationExports.map((station) => (
              <div key={station.station}>
                <div className="flex items-center justify-between text-sm text-primary">
                  <span>{station.station.replace('Sugar Land Fire ', '')}</span>
                  <span className="text-secondary text-xs">{formatNumber(station.totalIncidents)} incidents</span>
                </div>
                <BarRow
                  label={`${station.districtCount} districts`}
                  value={station.avgCrossDistrictRate}
                  max={highestStationRate}
                  formatter={(val) => formatPercent(val * 100, 1)}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default AnalysisBreakdown;
