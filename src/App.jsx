import { useState, useEffect, useCallback } from "react";
import MapView from "./components/MapView";
import StationProfile from "./components/StationProfile";
import SummaryStats from "./components/SummaryStats";
import TimeSeriesStrip from "./components/TimeSeriesStrip";
import RecommendationsPanel from "./components/RecommendationsPanel";
import { loadAllData, formatNumber, formatPercent } from "./utils/dataLoader";

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStation, setSelectedStation] = useState(null);

  // Load all data on mount
  useEffect(() => {
    loadAllData()
      .then((loadedData) => {
        setData(loadedData);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load data:", err);
        setError(err.message);
        setLoading(false);
      });
  }, []);

  // Handle station selection from map
  const handleStationSelect = useCallback((stationId) => {
    setSelectedStation(stationId);
  }, []);

  // Handle station deselection
  const handleStationDeselect = useCallback(() => {
    setSelectedStation(null);
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center animate-fade-in">
          <div className="font-mono text-stat-md text-primary mb-2">
            Loading
          </div>
          <div className="text-secondary text-sm">Preparing atlas data...</div>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="font-mono text-stat-md text-strain-high mb-2">
            Error
          </div>
          <div className="text-secondary text-sm">{error}</div>
        </div>
      </div>
    );
  }

  // Get summary stats for header
  const summaryStats = data?.dashboardConfig?.data_summary || {};
  const dateRange = summaryStats.date_range || "Jan 2023 – Sep 2024";

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Mobile-only overlay (site is not designed for phone screens) */}
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center sm:hidden">
        <div className="text-center px-6 max-w-sm">
          <div className="mx-auto mb-4 w-12 h-12 rounded-full border border-border flex items-center justify-center">
            <svg className="w-6 h-6 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17.25h4.5m-4.5 0a2.25 2.25 0 01-2.25-2.25V6.75A2.25 2.25 0 017.5 4.5h9a2.25 2.25 0 012.25 2.25V15a2.25 2.25 0 01-2.25 2.25m-4.5 0V19.5" />
            </svg>
          </div>
          <div className="font-sans text-xl font-semibold text-primary mb-2">Desktop view recommended</div>
          <p className="text-secondary text-sm leading-relaxed">
            This dashboard is optimized for computers and laptops. Please open on a larger screen for the intended experience.
          </p>
        </div>
      </div>
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-6 border-b border-border shrink-0 animate-fade-in">
        {/* Title */}
        <div className="flex items-center gap-4">
          <h1 className="font-sans text-xl font-semibold tracking-wide text-primary">
            STATION STRAIN ATLAS
          </h1>
          <span className="text-secondary text-xs tracking-wider uppercase">
            Sugar Land Fire-EMS
          </span>
        </div>

        {/* Header Stats Strip */}
        <div className="flex items-center gap-8">
          <div className="text-right">
            <div className="text-label uppercase text-secondary">Incidents</div>
            <div className="font-mono text-stat-sm text-primary tabular-nums">
              {formatNumber(summaryStats.total_incidents || 13988)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-label uppercase text-secondary">
              Cross-District
            </div>
            <div className="font-mono text-stat-sm text-primary tabular-nums">
              {formatPercent(summaryStats.cross_district_rate || 26.6)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-label uppercase text-secondary">Period</div>
            <div className="font-mono text-stat-sm text-primary tabular-nums">
              {dateRange.split(" – ")[0]} – {dateRange.split(" – ")[1]}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map Area (65%) */}
        <div className="w-[65%] flex flex-col border-r border-border animate-fade-in stagger-1">
          {/* Map */}
          <div className="flex-1 relative">
            {data && (
              <MapView
                stationLocations={data.stationLocations}
                districts={data.districts}
                railCrossings={data.railCrossings}
                districtProfiles={data.districtProfiles}
                selectedStation={selectedStation}
                onStationSelect={handleStationSelect}
              />
            )}
          </div>

          {/* Time Series Strip */}
          <div className="h-20 border-t border-border animate-fade-in stagger-4">
            {data && data.monthlyMetrics && (
              <TimeSeriesStrip
                monthlyMetrics={data.monthlyMetrics.monthly_metrics}
              />
            )}
          </div>
        </div>

        {/* Right Column (35%) */}
        <div className="w-[35%] flex flex-col overflow-hidden">

          {/* Station Profile Panel */}
          <div className="flex-1 overflow-y-auto border-b border-border animate-slide-in-right stagger-2">
            {data && (
              <StationProfile
                stationLocations={data.stationLocations}
                districtProfiles={data.districtProfiles}
                dashboardConfig={data.dashboardConfig}
                analysisResults={data.analysisResults}
                selectedStation={selectedStation}
                onDeselect={handleStationDeselect}
              />
            )}
          </div>

          {/* Summary Stats */}
          <div className="border-b border-border animate-slide-in-right stagger-3">
            {data && data.dashboardConfig && (
              <SummaryStats dashboardConfig={data.dashboardConfig} />
            )}
          </div>

          {/* Recommendations */}
          <div className="shrink-0 animate-slide-in-right stagger-4">
            {data && data.dashboardConfig && (
              <RecommendationsPanel dashboardConfig={data.dashboardConfig} />
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="h-8 flex items-center justify-center px-6 border-t border-border shrink-0">
        <span className="text-secondary text-xs">
          Data: Sugar Land Fire-EMS • Open Data Day 2026 • Methodology:
          Cross-district deployment analysis
        </span>
      </footer>
    </div>
  );
}

export default App;
