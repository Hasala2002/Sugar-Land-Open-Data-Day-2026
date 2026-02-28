/**
 * Stage 5: Build Geographic Data Layers
 * Station Strain Atlas - Sugar Land Open Data Day 2026
 * 
 * This script creates:
 * 1. station-locations.json - Fire station coordinates with strain metrics
 * 2. districts.geojson - Voronoi polygons representing station coverage zones
 * 3. rail-crossings.geojson - Railroad and highway corridors
 * 4. dashboard-config.json - Narrative framing and configuration
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Delaunay } from 'd3-delaunay';
import polygonClipping from 'polygon-clipping';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const PATHS = {
  analysisResults: join(__dirname, '..', 'data', 'processed', 'analysis-results.json'),
  cityLimits: join(__dirname, '..', 'data', 'processed', 'city-limits.geojson'),
  outputDir: join(__dirname, '..', 'data', 'processed'),
  stationLocationsOutput: join(__dirname, '..', 'data', 'processed', 'station-locations.json'),
  districtsOutput: join(__dirname, '..', 'data', 'processed', 'districts.geojson'),
  railCrossingsOutput: join(__dirname, '..', 'data', 'processed', 'rail-crossings.geojson'),
  dashboardConfigOutput: join(__dirname, '..', 'data', 'processed', 'dashboard-config.json')
};

// Sugar Land Fire Station coordinates
// NOTE: These coordinates drive BOTH the station markers and the Voronoi coverage zones.
const STATION_COORDINATES = [
  {
    id: 'Sugar Land Fire Station 1',
    name: 'Station 1',
    lat: 29.612712249874267,
    lng: -95.63564676971885,
    address: '1100 Eldridge Rd'
  },
  {
    id: 'Sugar Land Fire Station 2',
    name: 'Station 2',
    lat: 29.6409217516119,
    lng: -95.60724930524152,
    address: '3950 Elkins Rd'
  },
  {
    id: 'Sugar Land Fire Station 3',
    name: 'Station 3',
    lat: 29.591525990346497,
    lng: -95.59495045649187,
    address: '1935 First Colony Blvd'
  },
  {
    id: 'Sugar Land Fire Station 4',
    name: 'Station 4',
    lat: 29.585396411001913,
    lng: -95.61800398653222,
    address: '4238 Sweetwater Blvd'
  },
  {
    id: 'Sugar Land Fire Station 5',
    name: 'Station 5',
    lat: 29.559125619906876,
    lng: -95.63090748933,
    address: '13838 Southwest Frwy'
  },
  {
    id: 'Sugar Land Fire Station 6',
    name: 'Station 6',
    lat: 29.552337722320416,
    lng: -95.69364568463807,
    address: '545 Jury Rd'
  },
  {
    id: 'Sugar Land Fire Station 7',
    name: 'Station 7',
    lat: 29.592215451329363,
    lng: -95.65756064474678,
    address: '19990 SW Frwy'
  }
];

// Bounding box for clipping Voronoi coverage zones
// Must contain all station coordinates.
const BBOX = {
  // City limits bbox (from city-limits.geojson) extends slightly below 29.53.
  // Keep a little padding so Voronoi cells fully cover the boundary before clipping.
  minLat: 29.50,
  maxLat: 29.67,
  minLng: -95.72,
  maxLng: -95.47
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Clip a polygon to a bounding box using Sutherland-Hodgman algorithm
 */
function clipPolygonToBBox(polygon, bbox) {
  if (polygon.length < 3) return polygon;
  
  // Define clipping edges
  const clipEdges = [
    { type: 'left', value: bbox.minLng },    // Left edge
    { type: 'right', value: bbox.maxLng },   // Right edge
    { type: 'bottom', value: bbox.minLat },  // Bottom edge
    { type: 'top', value: bbox.maxLat }      // Top edge
  ];
  
  let output = [...polygon];
  
  for (const edge of clipEdges) {
    if (output.length === 0) break;
    
    const input = output;
    output = [];
    
    for (let i = 0; i < input.length; i++) {
      const current = input[i];
      const next = input[(i + 1) % input.length];
      
      const currentInside = isInsideEdge(current, edge);
      const nextInside = isInsideEdge(next, edge);
      
      if (currentInside) {
        output.push(current);
        if (!nextInside) {
          const intersection = computeIntersection(current, next, edge);
          if (intersection) output.push(intersection);
        }
      } else if (nextInside) {
        const intersection = computeIntersection(current, next, edge);
        if (intersection) output.push(intersection);
      }
    }
  }
  
  return output;
}

function isInsideEdge(point, edge) {
  switch (edge.type) {
    case 'left': return point[0] >= edge.value;
    case 'right': return point[0] <= edge.value;
    case 'bottom': return point[1] >= edge.value;
    case 'top': return point[1] <= edge.value;
    default: return true;
  }
}

function computeIntersection(p1, p2, edge) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  
  let t;
  switch (edge.type) {
    case 'left':
    case 'right':
      if (dx === 0) return null;
      t = (edge.value - p1[0]) / dx;
      break;
    case 'bottom':
    case 'top':
      if (dy === 0) return null;
      t = (edge.value - p1[1]) / dy;
      break;
    default:
      return null;
  }
  
  if (t < 0 || t > 1) return null;
  
  return [p1[0] + t * dx, p1[1] + t * dy];
}

/**
 * Ensure a ring is closed (first point equals last point)
 */
function closeRing(ring) {
  if (!ring || ring.length === 0) return ring;
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([...first]);
  }
  return ring;
}

/**
 * Convert d3 cell polygon points to a GeoJSON-compatible linear ring
 */
function cellToRing(cell) {
  if (!cell || cell.length < 3) return null;
  const ring = cell.map((p) => [p[0], p[1]]);
  return closeRing(ring);
}

/**
 * Convert polygon to GeoJSON format [lng, lat]
 */
function polygonToGeoJSON(polygon) {
  const ring = cellToRing(polygon);
  if (!ring || ring.length < 4) return null;
  return [ring]; // GeoJSON polygon rings array
}

function pointInRing(point, ring) {
  // Ray-casting algorithm; ring may be closed.
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];

    const intersects = (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygon(point, polygonRings) {
  if (!polygonRings || polygonRings.length === 0) return false;
  const outer = polygonRings[0];
  if (!pointInRing(point, outer)) return false;

  // Holes
  for (let i = 1; i < polygonRings.length; i++) {
    if (pointInRing(point, polygonRings[i])) return false;
  }

  return true;
}

function pointInMultiPolygon(point, multiPolygon) {
  if (!multiPolygon) return false;
  return multiPolygon.some((polygonRings) => pointInPolygon(point, polygonRings));
}

function geometryToMultiPolygon(geometry) {
  if (!geometry) return null;
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return null;
}

function geojsonToMultiPolygon(geojson) {
  if (!geojson) return null;

  const geometries = [];

  if (geojson.type === 'FeatureCollection') {
    for (const feature of geojson.features || []) {
      if (feature?.geometry) geometries.push(feature.geometry);
    }
  } else if (geojson.type === 'Feature') {
    if (geojson.geometry) geometries.push(geojson.geometry);
  } else {
    geometries.push(geojson);
  }

  const polys = geometries
    .map(geometryToMultiPolygon)
    .filter(Boolean);

  if (polys.length === 0) return null;

  // Union all polygons (handles multipart boundaries)
  let combined = polys[0];
  for (let i = 1; i < polys.length; i++) {
    combined = polygonClipping.union(combined, polys[i]);
  }

  return combined;
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

function main() {
  console.log('='.repeat(80));
  console.log('STATION STRAIN ATLAS - Geographic Data Layers');
  console.log('='.repeat(80));
  console.log();

  // -------------------------------------------------------------------------
  // STEP 1: Load Analysis Results
  // -------------------------------------------------------------------------
  console.log('📂 Loading analysis results...');
  console.log('-'.repeat(80));
  
  let analysisResults;
  try {
    const rawData = readFileSync(PATHS.analysisResults, 'utf-8');
    analysisResults = JSON.parse(rawData);
    console.log('   ✅ Loaded analysis-results.json');
  } catch (e) {
    console.error(`   ❌ Error loading analysis results: ${e.message}`);
    process.exit(1);
  }
  
  const stationRankings = analysisResults.district_analysis.station_export_rankings;
  const stationMetricsMap = {};
  
  for (const s of stationRankings) {
    stationMetricsMap[s.station] = {
      districtCount: s.districtCount,
      totalIncidents: s.totalIncidents,
      avgCrossDistrictRate: s.avgCrossDistrictRate
    };
  }
  
  // -------------------------------------------------------------------------
  // STEP 1B: Load City Limits (optional, used to clip Voronoi cells)
  // -------------------------------------------------------------------------
  console.log('🌆 Loading city limits boundary...');
  console.log('-'.repeat(80));

  let cityLimitsMultiPolygon = null;

  if (existsSync(PATHS.cityLimits)) {
    try {
      const rawCityLimits = readFileSync(PATHS.cityLimits, 'utf-8');
      const cityLimitsGeoJSON = JSON.parse(rawCityLimits);
      cityLimitsMultiPolygon = geojsonToMultiPolygon(cityLimitsGeoJSON);

      if (!cityLimitsMultiPolygon || cityLimitsMultiPolygon.length === 0) {
        console.warn('   ⚠️  city-limits.geojson loaded but contains no polygon geometry; falling back to bbox clipping.');
        cityLimitsMultiPolygon = null;
      } else {
        console.log('   ✅ Loaded city-limits.geojson');

        // Sanity check station points
        for (const station of STATION_COORDINATES) {
          const inside = pointInMultiPolygon([station.lng, station.lat], cityLimitsMultiPolygon);
          if (!inside) {
            console.warn(`   ⚠️  ${station.id} appears outside the city limits polygon — please verify station coordinates.`);
          }
        }
      }
    } catch (e) {
      console.warn(`   ⚠️  Failed to parse city-limits.geojson (${e.message}); falling back to bbox clipping.`);
      cityLimitsMultiPolygon = null;
    }
  } else {
    console.warn('   ⚠️  city-limits.geojson not found; falling back to bbox clipping.');
  }

  console.log();

  // -------------------------------------------------------------------------
  // STEP 2: Create Station Locations JSON
  // -------------------------------------------------------------------------
  console.log('📍 STEP 1: Creating station-locations.json...');
  console.log('-'.repeat(80));
  
  const stationLocations = STATION_COORDINATES.map(station => {
    const metrics = stationMetricsMap[station.id] || {
      districtCount: 0,
      totalIncidents: 0,
      avgCrossDistrictRate: 0
    };
    
    return {
      station_id: station.id,
      name: station.name,
      address: station.address,
      lat: station.lat,
      lng: station.lng,
      district_count: metrics.districtCount,
      total_incidents: metrics.totalIncidents,
      avg_cross_district_rate: metrics.avgCrossDistrictRate
    };
  });
  
  const stationLocationsOutput = {
    metadata: {
      generated_at: new Date().toISOString(),
      description: 'Sugar Land Fire Station locations with strain metrics'
    },
    stations: stationLocations
  };
  
  writeFileSync(PATHS.stationLocationsOutput, JSON.stringify(stationLocationsOutput, null, 2));
  
  const stationFileSizeKB = (JSON.stringify(stationLocationsOutput).length / 1024).toFixed(2);
  console.log(`   ✅ Created: ${PATHS.stationLocationsOutput}`);
  console.log(`   📦 File size: ${stationFileSizeKB} KB`);
  console.log();
  
  // Print station table
  console.log('   Station Locations with Strain Metrics:');
  console.log('   ' + '-'.repeat(75));
  console.log('   Station | Lat      | Lng       | Districts | Cross-District %');
  console.log('   ' + '-'.repeat(75));
  
  for (const s of stationLocations) {
    const name = s.name.padEnd(8);
    const lat = s.lat.toFixed(4).padStart(8);
    const lng = s.lng.toFixed(4).padStart(9);
    const districts = String(s.district_count).padStart(9);
    const rate = (s.avg_cross_district_rate * 100).toFixed(1).padStart(6) + '%';
    console.log(`   ${name} | ${lat} | ${lng} | ${districts} | ${rate}`);
  }
  console.log();

  // -------------------------------------------------------------------------
  // STEP 3: Create Voronoi District Polygons
  // -------------------------------------------------------------------------
  console.log('🗺️  STEP 2: Creating districts.geojson (Voronoi tessellation)...');
  console.log('-'.repeat(80));
  
  // Prepare points for Delaunay triangulation [lng, lat]
  const points = STATION_COORDINATES.map(s => [s.lng, s.lat]);
  
  // Create Delaunay triangulation
  const delaunay = Delaunay.from(points);
  
  // Generate Voronoi cells with a bounding box
  const voronoi = delaunay.voronoi([BBOX.minLng, BBOX.minLat, BBOX.maxLng, BBOX.maxLat]);
  
  const features = [];
  
  for (let i = 0; i < points.length; i++) {
    const station = STATION_COORDINATES[i];
    const metrics = stationMetricsMap[station.id] || {
      districtCount: 0,
      totalIncidents: 0,
      avgCrossDistrictRate: 0
    };
    
    // Get the Voronoi cell for this point
    const cell = voronoi.cellPolygon(i);
    
    if (cell) {
      const ring = cellToRing(cell);
      if (!ring || ring.length < 4) continue;

      let geometry = null;

      if (cityLimitsMultiPolygon) {
        // Intersect Voronoi cell with the city limits polygon to keep selectable regions inside the city.
        const clipped = polygonClipping.intersection([[ring]], cityLimitsMultiPolygon);

        if (clipped && clipped.length > 0) {
          if (clipped.length === 1) {
            geometry = { type: 'Polygon', coordinates: clipped[0] };
          } else {
            geometry = { type: 'MultiPolygon', coordinates: clipped };
          }
        }
      } else {
        // Fallback: bbox-clipped Voronoi cells
        const clippedCell = clipPolygonToBBox(cell, BBOX);
        const coordinates = polygonToGeoJSON(clippedCell);
        if (coordinates) {
          geometry = { type: 'Polygon', coordinates };
        }
      }

      if (geometry) {
        features.push({
          type: 'Feature',
          properties: {
            station_id: station.id,
            station_name: station.name,
            district_count: metrics.districtCount,
            total_incidents: metrics.totalIncidents,
            avg_cross_district_rate: metrics.avgCrossDistrictRate
          },
          geometry
        });
      }
    }
  }
  
  const districtsGeoJSON = {
    type: 'FeatureCollection',
    metadata: {
      generated_at: new Date().toISOString(),
      description: 'Voronoi tessellation of station coverage zones (approximate)',
      note: 'These are theoretical coverage zones based on station locations, not official district boundaries'
    },
    features: features
  };
  
  writeFileSync(PATHS.districtsOutput, JSON.stringify(districtsGeoJSON, null, 2));
  
  const districtsFileSizeKB = (JSON.stringify(districtsGeoJSON).length / 1024).toFixed(2);
  console.log(`   ✅ Created: ${PATHS.districtsOutput}`);
  console.log(`   📦 File size: ${districtsFileSizeKB} KB`);
  console.log(`   📊 Features: ${features.length} Voronoi polygons`);
  console.log();

  // -------------------------------------------------------------------------
  // STEP 4: Create Rail and Highway Corridors
  // -------------------------------------------------------------------------
  console.log('🚂 STEP 3: Creating rail-crossings.geojson...');
  console.log('-'.repeat(80));
  
  const corridorFeatures = [
    {
      type: 'Feature',
      properties: {
        name: 'Union Pacific Railroad',
        type: 'railroad',
        description: 'Major rail corridor running parallel to US-90 through Sugar Land'
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-95.64, 29.575],   // West entry
          [-95.62, 29.578],   // Approaching downtown
          [-95.60, 29.580],   // Near Station 1
          [-95.585, 29.585],  // Downtown
          [-95.56, 29.590],   // Near Station 3
          [-95.53, 29.595],   // East Sugar Land
          [-95.49, 29.60]     // East exit
        ]
      }
    },
    {
      type: 'Feature',
      properties: {
        name: 'US-90 (South Main Street)',
        type: 'highway',
        description: 'Major east-west arterial running parallel to railroad'
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-95.64, 29.570],   // West entry
          [-95.60, 29.572],   // Near Station 1
          [-95.58, 29.575],   // Downtown
          [-95.54, 29.578],   // Near Station 3
          [-95.49, 29.582]    // East exit
        ]
      }
    },
    {
      type: 'Feature',
      properties: {
        name: 'US-59 / I-69 (Southwest Freeway)',
        type: 'highway',
        description: 'Major interstate highway running NE-SW through Sugar Land'
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-95.65, 29.545],   // SW entry
          [-95.62, 29.555],   // Near Station 2
          [-95.59, 29.570],   // Near Station 1
          [-95.55, 29.585],   // Near Station 5
          [-95.51, 29.575],   // Near Station 7
          [-95.47, 29.580]    // NE exit
        ]
      }
    },
    {
      type: 'Feature',
      properties: {
        name: 'TX-6 (Southwest Bypass)',
        type: 'highway',
        description: 'North-south bypass on the western side'
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-95.63, 29.52],    // South entry
          [-95.63, 29.55],    // Near Station 2
          [-95.635, 29.58],   // Through central area
          [-95.64, 29.62]     // North exit
        ]
      }
    }
  ];
  
  const railCrossingsGeoJSON = {
    type: 'FeatureCollection',
    metadata: {
      generated_at: new Date().toISOString(),
      description: 'Transportation corridors that create barriers to emergency response'
    },
    features: corridorFeatures
  };
  
  writeFileSync(PATHS.railCrossingsOutput, JSON.stringify(railCrossingsGeoJSON, null, 2));
  
  const railCrossingsFileSizeKB = (JSON.stringify(railCrossingsGeoJSON).length / 1024).toFixed(2);
  console.log(`   ✅ Created: ${PATHS.railCrossingsOutput}`);
  console.log(`   📦 File size: ${railCrossingsFileSizeKB} KB`);
  console.log(`   📊 Features: ${corridorFeatures.length} corridors`);
  console.log();
  
  // Print corridor table
  console.log('   Corridor Features:');
  console.log('   ' + '-'.repeat(60));
  
  for (const f of corridorFeatures) {
    const type = f.properties.type === 'railroad' ? '🚂 Railroad' : '🛣️  Highway';
    console.log(`   ${type}: ${f.properties.name}`);
  }
  console.log();

  // -------------------------------------------------------------------------
  // STEP 5: Create Dashboard Config
  // -------------------------------------------------------------------------
  console.log('🎨 STEP 4: Creating dashboard-config.json...');
  console.log('-'.repeat(80));
  
  const dashboardConfig = {
    title: "Station Strain Atlas",
    subtitle: "Mapping where Sugar Land's emergency response system is quietly under stress",
    thesis: "Sugar Land's Fire-EMS dispatch system is resilient — response times remain stable even under strain. But 26.6% of all incidents require cross-district deployment, and some areas rely on non-home stations over 50% of the time. As the city grows, these pressure points need attention.",
    highlight_districts: ["3M2", "302", "3S2", "1S1", "3S1"],
    highlight_station: "Sugar Land Fire Station 3",
    highlight_reason: "Station 3's districts average a 49.5% cross-district rate — the highest of any station. Nearly half of all incidents in its coverage area require backup from another station.",
    data_summary: {
      total_incidents: 13988,
      total_apparatus_dispatches: 26287,
      date_range: "Jan 2023 – Sep 2024",
      months_analyzed: 21,
      overall_cross_district_rate: 26.6,
      stations: 7,
      districts: 42
    },
    narrative_framing: {
      type: "resilience",
      primary_message: "Response times remain stable even under strain",
      secondary_message: "District strain patterns reveal growth pressure points",
      call_to_action: "Use these insights for proactive resource allocation as Sugar Land grows"
    },
    correlation_summary: {
      main_correlation_r2: 0.022,
      interpretation: "No significant relationship between cross-district rate and response time",
      conclusion: "System is resilient — strain doesn't degrade performance"
    },
    station_rankings: {
      highest_strain: {
        station: "Sugar Land Fire Station 3",
        rate: 49.5
      },
      most_self_sufficient: {
        station: "Sugar Land Fire Station 6",
        rate: 11.3
      }
    },
    geographic_insights: {
      barrier_zones: ["1S1", "1S2", "3S1", "3S2", "3M1", "3M2"],
      barrier_description: "Districts near railroad/US-90 corridor show highest strain",
      highway_districts: ["609", "206"],
      highway_description: "Highway MVA districts have extreme cross-district rates but low volume"
    }
  };
  
  writeFileSync(PATHS.dashboardConfigOutput, JSON.stringify(dashboardConfig, null, 2));
  
  const configFileSizeKB = (JSON.stringify(dashboardConfig).length / 1024).toFixed(2);
  console.log(`   ✅ Created: ${PATHS.dashboardConfigOutput}`);
  console.log(`   📦 File size: ${configFileSizeKB} KB`);
  console.log();
  
  // Print config summary
  console.log('   Dashboard Configuration Summary:');
  console.log('   ' + '-'.repeat(60));
  console.log(`   Title: ${dashboardConfig.title}`);
  console.log(`   Subtitle: ${dashboardConfig.subtitle}`);
  console.log(`   Narrative: ${dashboardConfig.narrative_framing.type}`);
  console.log(`   Highlight Districts: ${dashboardConfig.highlight_districts.join(', ')}`);
  console.log(`   Highlight Station: ${dashboardConfig.highlight_station}`);
  console.log();

  // -------------------------------------------------------------------------
  // FINAL SUMMARY
  // -------------------------------------------------------------------------
  console.log('='.repeat(80));
  console.log('✅ GEOGRAPHIC DATA LAYERS COMPLETE');
  console.log('='.repeat(80));
  console.log();
  console.log('📁 Files Created:');
  console.log('   ' + '-'.repeat(75));
  console.log(`   station-locations.json    ${stationFileSizeKB.padStart(8)} KB  - Station coords + metrics`);
  console.log(`   districts.geojson         ${districtsFileSizeKB.padStart(8)} KB  - Voronoi coverage zones`);
  console.log(`   rail-crossings.geojson    ${railCrossingsFileSizeKB.padStart(8)} KB  - Rail/highway corridors`);
  console.log(`   dashboard-config.json     ${configFileSizeKB.padStart(8)} KB  - Narrative + config`);
  console.log();
  console.log('📊 Key Geographic Insights:');
  console.log('   • Station 3 (First Colony) is the highest-strain coverage zone');
  console.log('   • Railroad/US-90 corridor creates a barrier dividing the system');
  console.log('   • Station 6 (Jury Rd) is most self-sufficient at 11.3%');
  console.log('   • Boundary zone districts (3M2, 3S1, 3S2) need proactive attention');
  console.log();
  console.log('🚀 Next Step: Build React dashboard using these data layers');
  console.log();
}

// Run the script
main();
