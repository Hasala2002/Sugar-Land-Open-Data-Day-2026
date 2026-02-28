/**
 * Data loader utilities for Station Strain Atlas
 * Fetches JSON and GeoJSON files from /data/
 */

const DATA_PATH = '/data/';

/**
 * Load station locations with coordinates and metrics
 */
export async function loadStationLocations() {
  const response = await fetch(`${DATA_PATH}station-locations.json`);
  if (!response.ok) throw new Error(`Failed to load station locations: ${response.status}`);
  return response.json();
}

/**
 * Load Voronoi district polygons
 */
export async function loadDistrictsGeoJSON() {
  const response = await fetch(`${DATA_PATH}districts.geojson`);
  if (!response.ok) throw new Error(`Failed to load districts: ${response.status}`);
  return response.json();
}

/**
 * Load railroad and highway corridors
 */
export async function loadRailCrossingsGeoJSON() {
  const response = await fetch(`${DATA_PATH}rail-crossings.geojson`);
  if (!response.ok) throw new Error(`Failed to load rail crossings: ${response.status}`);
  return response.json();
}

/**
 * Load dashboard configuration and narrative
 */
export async function loadDashboardConfig() {
  const response = await fetch(`${DATA_PATH}dashboard-config.json`);
  if (!response.ok) throw new Error(`Failed to load dashboard config: ${response.status}`);
  return response.json();
}

/**
 * Load monthly aggregated metrics
 */
export async function loadMonthlyMetrics() {
  const response = await fetch(`${DATA_PATH}monthly-metrics.json`);
  if (!response.ok) throw new Error(`Failed to load monthly metrics: ${response.status}`);
  return response.json();
}

/**
 * Load district profiles with detailed stats
 */
export async function loadDistrictProfiles() {
  const response = await fetch(`${DATA_PATH}district-profiles.json`);
  if (!response.ok) throw new Error(`Failed to load district profiles: ${response.status}`);
  return response.json();
}

/**
 * Load correlation analysis results
 */
export async function loadAnalysisResults() {
  const response = await fetch(`${DATA_PATH}analysis-results.json`);
  if (!response.ok) throw new Error(`Failed to load analysis results: ${response.status}`);
  return response.json();
}

/**
 * Load all data in parallel
 */
export async function loadAllData() {
  const [
    stationLocations,
    districts,
    railCrossings,
    dashboardConfig,
    monthlyMetrics,
    districtProfiles,
    analysisResults,
  ] = await Promise.all([
    loadStationLocations(),
    loadDistrictsGeoJSON(),
    loadRailCrossingsGeoJSON(),
    loadDashboardConfig(),
    loadMonthlyMetrics(),
    loadDistrictProfiles(),
    loadAnalysisResults(),
  ]);

  return {
    stationLocations,
    districts,
    railCrossings,
    dashboardConfig,
    monthlyMetrics,
    districtProfiles,
    analysisResults,
  };
}

/**
 * Get strain color based on cross-district rate
 */
export function getStrainColor(rate) {
  if (rate < 15) return '#22c55e'; // green
  if (rate < 25) return blendColors('#22c55e', '#eab308', (rate - 15) / 10);
  if (rate < 35) return blendColors('#eab308', '#ef4444', (rate - 25) / 10);
  return '#ef4444'; // red
}

/**
 * Blend two hex colors
 */
function blendColors(color1, color2, factor) {
  const r1 = parseInt(color1.slice(1, 3), 16);
  const g1 = parseInt(color1.slice(3, 5), 16);
  const b1 = parseInt(color1.slice(5, 7), 16);
  
  const r2 = parseInt(color2.slice(1, 3), 16);
  const g2 = parseInt(color2.slice(3, 5), 16);
  const b2 = parseInt(color2.slice(5, 7), 16);
  
  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Format number with commas
 */
export function formatNumber(num) {
  return num.toLocaleString();
}

/**
 * Format percentage
 */
export function formatPercent(num, decimals = 1) {
  return `${num.toFixed(decimals)}%`;
}

/**
 * Get station name from station ID
 */
export function getStationName(stationId) {
  const names = {
    'S1': 'Station 1 — Eldridge Rd',
    'S2': 'Station 2 — Sugar Creek',
    'S3': 'Station 3 — First Colony Blvd',
    'S4': 'Station 4 — Burney Rd',
    'S5': 'Station 5 — University Blvd',
    'S6': 'Station 6 — Settlers Way',
    'S7': 'Station 7 — Fluor Daniel Dr',
  };
  return names[stationId] || stationId;
}

/**
 * Get short station label
 */
export function getStationLabel(stationId) {
  return stationId.replace('S', 'Station ');
}
