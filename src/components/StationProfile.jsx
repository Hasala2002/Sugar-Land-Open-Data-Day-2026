import { useState, useEffect, useRef } from 'react';
import { formatNumber, formatPercent, getStrainColor } from '../utils/dataLoader';

// Animated counter hook
function useCountUp(value, duration = 400) {
  const [displayValue, setDisplayValue] = useState(0);
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    startTimeRef.current = null;
    
    const animate = (timestamp) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const progress = Math.min((timestamp - startTimeRef.current) / duration, 1);
      
      // Ease out quad
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplayValue(Math.floor(value * eased));
      
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
      }
    };
    
    rafRef.current = requestAnimationFrame(animate);
    
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return displayValue;
}

// Compact bar component for ranking
function MiniBar({ value, max, color }) {
  const width = (value / max) * 100;
  return (
    <div className="w-16 h-1.5 bg-border/50 rounded overflow-hidden">
      <div 
        className="h-full rounded transition-all duration-300"
        style={{ width: `${width}%`, background: color }}
      />
    </div>
  );
}

// Incident type bar
function IncidentBar({ type, count, max }) {
  const width = (count / max) * 100;
  return (
    <div className="flex items-center gap-3 mb-1.5">
      <span className="text-xs text-secondary w-20 truncate">{type}</span>
      <div className="flex-1 h-4 bg-border/30 rounded overflow-hidden">
        <div 
          className="h-full bg-white/30 rounded transition-all duration-300"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="font-mono text-xs text-primary w-8 text-right tabular-nums">{count}</span>
    </div>
  );
}

// Get short station label from full name
function getShortLabel(stationName) {
  const match = stationName?.match(/Station (\d)/);
  return match ? `S${match[1]}` : stationName;
}

// Get display name for station
function getStationDisplayName(stationName) {
  return stationName?.replace('Sugar Land Fire ', '') || stationName;
}

function StationProfile({ stationLocations, districtProfiles, dashboardConfig, analysisResults, selectedStation, onDeselect }) {
  const [stationRanking, setStationRanking] = useState([]);
  const topStrainDistricts = (analysisResults?.district_analysis?.top_strain_districts || []).slice(0, 5);
  const stationExportRankings = analysisResults?.district_analysis?.station_export_rankings || [];

  // Get selected station data
  const selectedData = selectedStation && stationLocations?.stations?.find(s => s.station_id === selectedStation);
  const selectedTopStrainDistricts = topStrainDistricts.filter(
    (district) => district.home_station === selectedStation
  );
  const selectedExportLoad = stationExportRankings.find(
    (station) => station.station === selectedStation
  );
  
  // Animated values for selected station
  const animatedIncidents = useCountUp(selectedData?.total_incidents || 0);
  const animatedCrossDistrict = useCountUp(Math.round((selectedData?.avg_cross_district_rate || 0) * 100));
  const animatedDistricts = useCountUp(selectedData?.district_count || 0);

  // Build station ranking on mount
  useEffect(() => {
    if (stationLocations?.stations) {
      const ranking = [...stationLocations.stations]
        .sort((a, b) => (b.avg_cross_district_rate || 0) - (a.avg_cross_district_rate || 0))
        .map((station) => ({
          id: station.station_id,
          name: getStationDisplayName(station.station_id),
          rate: (station.avg_cross_district_rate || 0) * 100, // Convert to percentage
          incidents: station.total_incidents || 0,
        }));
      setStationRanking(ranking);
    }
  }, [stationLocations]);

  // Get incident types for selected station's districts
  function getIncidentTypes() {
    if (!selectedStation || !districtProfiles) return [];
    
    // Find districts served by this station
    const stationDistricts = Object.values(districtProfiles).filter(
      d => d.home_station === selectedStation
    );
    
    // Aggregate incident types
    const typeCounts = {};
    stationDistricts.forEach(d => {
      if (d.incident_types) {
        Object.entries(d.incident_types).forEach(([type, count]) => {
          typeCounts[type] = (typeCounts[type] || 0) + count;
        });
      }
    });
    
    // Sort and take top 5
    return Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }));
  }

  // If no station selected, show ranking
  if (!selectedStation) {
    const maxRate = Math.max(...stationRanking.map(s => s.rate), 1);
    const maxDistrictRate = Math.max(
      ...topStrainDistricts.map((district) => (district.cross_district_rate || 0) * 100),
      1
    );
    
    return (
      <div className="p-5">
        <div className="flex items-center gap-2 mb-4 text-secondary">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
          </svg>
          <span className="text-sm">Select a station zone on the map</span>
        </div>
        
        <div className="text-label uppercase text-secondary mb-3">All Stations by Strain</div>
        <div className="space-y-2">
          {stationRanking.map((station, idx) => (
            <div 
              key={station.id}
              className={`flex items-center gap-3 py-1.5 px-2 rounded ${
                station.id === 'Sugar Land Fire Station 3' ? 'bg-strain-high/10 border-l-2 border-strain-high' : ''
              }`}
            >
              <span className="text-xs text-secondary w-4">#{idx + 1}</span>
              <span className={`text-sm flex-1 ${station.id === 'Sugar Land Fire Station 3' ? 'text-primary' : 'text-primary/70'}`}>
                {station.name}
              </span>
              <MiniBar value={station.rate} max={maxRate} color={getStrainColor(station.rate)} />
              <span 
                className="font-mono text-xs w-12 text-right tabular-nums"
                style={{ color: getStrainColor(station.rate) }}
              >
                {formatPercent(station.rate)}
              </span>
            </div>
          ))}
        </div>

        {topStrainDistricts.length > 0 && (
          <div className="mt-6 pt-4 border-t border-border">
            <div className="text-label uppercase text-secondary mb-3">Top Strain Districts</div>
            <div className="space-y-2">
              {topStrainDistricts.map((district) => {
                const rate = (district.cross_district_rate || 0) * 100;

                return (
                  <div key={district.district} className="flex items-center gap-3 py-1.5 px-2 rounded bg-surface/30">
                    <span className="text-xs text-secondary w-4">#{district.rank}</span>
                    <span className="text-sm text-primary w-10">{district.district}</span>
                    <MiniBar value={rate} max={maxDistrictRate} color={getStrainColor(rate)} />
                    <span
                      className="font-mono text-xs w-12 text-right tabular-nums"
                      style={{ color: getStrainColor(rate) }}
                    >
                      {formatPercent(rate)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Selected station view
  const incidentTypes = getIncidentTypes();
  const maxIncidentCount = Math.max(...incidentTypes.map(i => i.count), 1);
  const strainColor = getStrainColor((selectedData?.avg_cross_district_rate || 0) * 100);

  return (
    <div className="p-5">
      {/* Header with close button */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-label uppercase text-secondary mb-1">Selected Station</div>
          <h2 className="font-sans text-lg font-semibold text-primary">
            {getStationDisplayName(selectedStation)}
          </h2>
        </div>
        <button
          onClick={onDeselect}
          className="text-secondary hover:text-primary transition-colors p-1"
          aria-label="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Big Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div>
          <div className="text-label uppercase text-secondary mb-1">Incidents</div>
          <div className="font-mono text-stat-lg text-primary tabular-nums">
            {formatNumber(animatedIncidents)}
          </div>
        </div>
        <div>
          <div className="text-label uppercase text-secondary mb-1">Cross-District</div>
          <div 
            className="font-mono text-stat-lg tabular-nums"
            style={{ color: strainColor }}
          >
            {formatPercent(animatedCrossDistrict)}
          </div>
        </div>
        <div>
          <div className="text-label uppercase text-secondary mb-1">Districts</div>
          <div className="font-mono text-stat-lg text-primary tabular-nums">
            {animatedDistricts}
          </div>
        </div>
      </div>

      {/* Incident Types */}
      {incidentTypes.length > 0 && (
        <div className="mb-6">
          <div className="text-label uppercase text-secondary mb-3">Top Incident Types</div>
          <div>
            {incidentTypes.map(({ type, count }) => (
              <IncidentBar key={type} type={type} count={count} max={maxIncidentCount} />
            ))}
          </div>
        </div>
      )}

      {/* Top Strain Districts (selected station only) */}
      {selectedTopStrainDistricts.length > 0 && (
        <div className="mb-6">
          <div className="text-label uppercase text-secondary mb-3">Top Strain Districts (This Station)</div>
          <div className="space-y-2">
            {selectedTopStrainDistricts.map((district) => {
              const rate = (district.cross_district_rate || 0) * 100;
              return (
                <div key={district.district} className="flex items-center justify-between py-1.5 px-2 rounded bg-surface/30">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-secondary">#{district.rank}</span>
                    <span className="text-sm text-primary">{district.district}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs text-secondary tabular-nums">
                      {formatNumber(district.total_incidents || 0)}
                    </span>
                    <span
                      className="font-mono text-xs tabular-nums"
                      style={{ color: getStrainColor(rate) }}
                    >
                      {formatPercent(rate)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Station Export Load */}
      {selectedExportLoad && (
        <div className="mb-4 pt-3 border-t border-border">
          <div className="text-label uppercase text-secondary mb-3">Station Export Load</div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-label uppercase text-secondary mb-1">Incidents</div>
              <div className="font-mono text-stat-md text-primary tabular-nums">
                {formatNumber(selectedExportLoad.totalIncidents || 0)}
              </div>
            </div>
            <div>
              <div className="text-label uppercase text-secondary mb-1">Districts</div>
              <div className="font-mono text-stat-md text-primary tabular-nums">
                {selectedExportLoad.districtCount || 0}
              </div>
            </div>
            <div>
              <div className="text-label uppercase text-secondary mb-1">Cross-District</div>
              <div
                className="font-mono text-stat-md tabular-nums"
                style={{ color: getStrainColor((selectedExportLoad.avgCrossDistrictRate || 0) * 100) }}
              >
                {formatPercent((selectedExportLoad.avgCrossDistrictRate || 0) * 100)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Station Address */}
      {selectedData?.address && (
        <div className="text-xs text-secondary mt-4 pt-3 border-t border-border">
          <span className="opacity-70">Address:</span> {selectedData.address}
        </div>
      )}
    </div>
  );
}

export default StationProfile;
