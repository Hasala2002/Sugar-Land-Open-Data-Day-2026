/**
 * Stage 2: Data Preparation Script
 * Station Strain Atlas - Sugar Land Open Data Day 2026
 * 
 * This script:
 * 1. Reads EMS and Fire incident CSVs
 * 2. Normalizes district codes between the two datasets
 * 3. Creates unique incident IDs for multi-apparatus calls
 * 4. Builds the HOME STATION MAP (critical for cross-district analysis)
 * 5. Flags cross-district deployments
 * 6. Outputs cleaned data to JSON
 */

import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const PATHS = {
  emsIncidents: join(__dirname, '..', 'data', 'raw', 'ems-incidents.csv.csv'),
  fireIncidents: join(__dirname, '..', 'data', 'raw', 'fire-incidents.csv'),
  outputDir: join(__dirname, '..', 'data', 'processed'),
  outputFile: join(__dirname, '..', 'data', 'processed', 'combined-incidents.json')
};

// Location names that represent mutual aid calls (outside Sugar Land district system)
const MUTUAL_AID_LOCATIONS = [
  'HOUSTON', 'MISSOURI CITY', 'NEEDVILLE', 'NORTHEAST', 'PECAN GROVE', 
  'PLEAK', 'RICHMOND', 'ROSENBERG', 'STAFFORD'
];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseCSV(filepath) {
  const content = readFileSync(filepath, 'utf-8');
  // Handle BOM if present
  const cleanContent = content.replace(/^\uFEFF/, '');
  return parse(cleanContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
}

function parseIncidentDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') {
    return null;
  }
  
  try {
    // Format: "2023-01-01 07:24:35-06:00" or "2023-01-01 07:24:35-05:00"
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return null;
    }
    
    // Extract components using local time methods for consistency
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 0-indexed
    const day = date.getDate();
    const hour = date.getHours();
    const dayOfWeek = date.getDay(); // 0=Sunday, 6=Saturday
    
    return {
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      year_month: `${year}-${String(month).padStart(2, '0')}`,
      year,
      month,
      day,
      hour,
      day_of_week: dayOfWeek
    };
  } catch (e) {
    return null;
  }
}

/**
 * Normalize Fire district codes to match EMS format
 * - S601 → 601
 * - S3S2 → 3S2
 * - STAFFORD → STAFFORD (mutual aid, keep as-is but flag)
 */
function normalizeFireDistrict(districtName) {
  if (!districtName || districtName.trim() === '') {
    return { district: null, isMutualAid: false };
  }
  
  const trimmed = districtName.trim();
  
  // Check if it's a mutual aid location
  if (MUTUAL_AID_LOCATIONS.includes(trimmed.toUpperCase())) {
    return { district: trimmed.toUpperCase(), isMutualAid: true };
  }
  
  // Check if it starts with 'S' followed by a digit or letter (S601, S3S2, etc.)
  if (/^S[A-Z0-9]/.test(trimmed)) {
    // Remove the leading 'S'
    return { district: trimmed.substring(1), isMutualAid: false };
  }
  
  // Already in correct format or unknown
  return { district: trimmed, isMutualAid: false };
}

/**
 * Create a unique incident ID from timestamp + district
 * This groups multiple apparatus responding to the same incident
 */
function createIncidentId(dateStr, district) {
  if (!dateStr || !district) return null;
  // Use the full timestamp and district to create a unique key
  return `${dateStr}|${district}`;
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

function main() {
  console.log('='.repeat(80));
  console.log('STATION STRAIN ATLAS - Stage 2: Data Preparation');
  console.log('='.repeat(80));
  console.log();

  // -------------------------------------------------------------------------
  // STEP 1: Load Raw Data
  // -------------------------------------------------------------------------
  console.log('📂 STEP 1: Loading raw CSV files...');
  console.log('-'.repeat(80));
  
  let emsData, fireData;
  
  try {
    emsData = parseCSV(PATHS.emsIncidents);
    console.log(`   ✅ EMS incidents loaded: ${emsData.length.toLocaleString()} rows`);
  } catch (e) {
    console.error(`   ❌ Error loading EMS file: ${e.message}`);
    process.exit(1);
  }
  
  try {
    fireData = parseCSV(PATHS.fireIncidents);
    console.log(`   ✅ Fire incidents loaded: ${fireData.length.toLocaleString()} rows`);
  } catch (e) {
    console.error(`   ❌ Error loading Fire file: ${e.message}`);
    process.exit(1);
  }
  
  console.log();

  // -------------------------------------------------------------------------
  // STEP 2: Process and Combine Data
  // -------------------------------------------------------------------------
  console.log('🔄 STEP 2: Processing and combining records...');
  console.log('-'.repeat(80));
  
  const allRecords = [];
  const districtMappingLog = [];
  const missingDateLog = [];
  const missingDistrictLog = [];
  const missingStationLog = [];
  
  // Process EMS data
  console.log('   Processing EMS records...');
  let emsProcessed = 0;
  let emsSkipped = 0;
  
  for (const row of emsData) {
    const dateInfo = parseIncidentDate(row['Incident Date']);
    
    if (!dateInfo) {
      missingDateLog.push({ source: 'EMS', row });
      emsSkipped++;
      continue;
    }
    
    const district = row['District'] ? row['District'].trim() : null;
    const station = row['Station'] ? row['Station'].trim() : null;
    
    if (!district) {
      missingDistrictLog.push({ source: 'EMS', date: dateInfo.date, station });
    }
    if (!station) {
      missingStationLog.push({ source: 'EMS', date: dateInfo.date, district });
    }
    
    allRecords.push({
      // Original fields
      incident_date_raw: row['Incident Date'],
      incident_type_code: row['Incident Type Code'],
      incident_type: row['Incident Type'],
      apparatus_name: row['Apparatus Name'],
      priority: row['Priority'] ? row['Priority'].trim() : null,
      district: district,
      station: station,
      city: row['City'] ? row['City'].toUpperCase().trim() : null,
      shift: row['Shift'] ? row['Shift'].trim() : null,
      
      // Derived fields
      service_type: 'EMS',
      is_mutual_aid: false,
      
      // Parsed date fields
      ...dateInfo
    });
    
    emsProcessed++;
  }
  
  console.log(`   ✅ EMS: ${emsProcessed.toLocaleString()} processed, ${emsSkipped} skipped (missing date)`);
  
  // Process Fire data with district normalization
  console.log('   Processing Fire records with district normalization...');
  let fireProcessed = 0;
  let fireSkipped = 0;
  const fireDistrictMappings = new Map();
  
  for (const row of fireData) {
    const dateInfo = parseIncidentDate(row['Incident Date']);
    
    if (!dateInfo) {
      missingDateLog.push({ source: 'Fire', row });
      fireSkipped++;
      continue;
    }
    
    // CRITICAL: Normalize Fire district codes
    const { district, isMutualAid } = normalizeFireDistrict(row['District Name']);
    const originalDistrict = row['District Name'];
    
    // Track district mappings for verification
    if (originalDistrict && !fireDistrictMappings.has(originalDistrict)) {
      fireDistrictMappings.set(originalDistrict, {
        original: originalDistrict,
        normalized: district,
        isMutualAid
      });
    }
    
    const station = row['Station'] ? row['Station'].trim() : null;
    
    if (!district) {
      missingDistrictLog.push({ source: 'Fire', date: dateInfo.date, station, originalDistrict });
    }
    if (!station) {
      missingStationLog.push({ source: 'Fire', date: dateInfo.date, district });
    }
    
    allRecords.push({
      // Original fields
      incident_date_raw: row['Incident Date'],
      incident_type_code: row['Incident Type Code'],
      incident_type: row['Incident Type'],
      apparatus_name: row['Apparatus Name'],
      priority: row['Priority'] ? row['Priority'].trim() : null,
      district: district,
      station: station,
      city: row['City'] ? row['City'].toUpperCase().trim() : null,
      shift: row['Shift'] ? row['Shift'].trim() : null,
      
      // Derived fields
      service_type: 'Fire',
      is_mutual_aid: isMutualAid,
      _original_district: isMutualAid ? originalDistrict : null,
      
      // Parsed date fields
      ...dateInfo
    });
    
    fireProcessed++;
  }
  
  console.log(`   ✅ Fire: ${fireProcessed.toLocaleString()} processed, ${fireSkipped} skipped (missing date)`);
  
  console.log();
  console.log(`   📊 TOTAL RECORDS: ${allRecords.length.toLocaleString()}`);
  console.log();

  // -------------------------------------------------------------------------
  // STEP 3: Print District Mapping Table (CRITICAL)
  // -------------------------------------------------------------------------
  console.log('🗺️  STEP 3: Fire District Code Normalization Mapping');
  console.log('-'.repeat(80));
  console.log('   This maps Fire district codes (with "S" prefix) to EMS format');
  console.log();
  console.log('   Original Fire Code → Normalized → Type');
  console.log('   ' + '-'.repeat(50));
  
  const sortedMappings = [...fireDistrictMappings.values()].sort((a, b) => {
    // Sort mutual aid to the end
    if (a.isMutualAid && !b.isMutualAid) return 1;
    if (!a.isMutualAid && b.isMutualAid) return -1;
    return a.original.localeCompare(b.original);
  });
  
  for (const mapping of sortedMappings) {
    const type = mapping.isMutualAid ? '🤝 MUTUAL AID' : '📍 District';
    console.log(`   ${mapping.original.padEnd(20)} → ${(mapping.normalized || 'NULL').padEnd(12)} ${type}`);
  }
  
  const mutualAidCount = [...fireDistrictMappings.values()].filter(m => m.isMutualAid).length;
  const districtCount = fireDistrictMappings.size - mutualAidCount;
  console.log();
  console.log(`   📊 Summary: ${districtCount} Sugar Land districts, ${mutualAidCount} mutual aid locations`);
  console.log();

  // -------------------------------------------------------------------------
  // STEP 4: Log Data Quality Issues
  // -------------------------------------------------------------------------
  console.log('⚠️  STEP 4: Data Quality Issues');
  console.log('-'.repeat(80));
  
  console.log(`   Missing Incident Date: ${missingDateLog.length} rows dropped`);
  if (missingDateLog.length > 0 && missingDateLog.length <= 20) {
    for (const item of missingDateLog) {
      console.log(`      - ${item.source}: ${JSON.stringify(item.row).substring(0, 100)}...`);
    }
  }
  
  console.log(`   Missing District: ${missingDistrictLog.length} rows (kept, will be excluded from home station analysis)`);
  if (missingDistrictLog.length > 0 && missingDistrictLog.length <= 10) {
    for (const item of missingDistrictLog) {
      console.log(`      - ${item.source}: date=${item.date}, station=${item.station}`);
    }
  }
  
  console.log(`   Missing Station: ${missingStationLog.length} rows (kept, will be excluded from home station analysis)`);
  if (missingStationLog.length > 0 && missingStationLog.length <= 10) {
    for (const item of missingStationLog) {
      console.log(`      - ${item.source}: date=${item.date}, district=${item.district}`);
    }
  }
  console.log();

  // -------------------------------------------------------------------------
  // STEP 5: Create Incident IDs (Handle Multi-Apparatus Calls)
  // -------------------------------------------------------------------------
  console.log('🆔 STEP 5: Creating Incident IDs (grouping multi-apparatus responses)');
  console.log('-'.repeat(80));
  
  // Add incident_id to each record
  for (const record of allRecords) {
    record.incident_id = createIncidentId(record.incident_date_raw, record.district);
  }
  
  // Count unique incidents
  const uniqueIncidents = new Set(allRecords.filter(r => r.incident_id).map(r => r.incident_id));
  const apparatusCount = allRecords.filter(r => r.incident_id).length;
  const avgApparatusPerIncident = apparatusCount / uniqueIncidents.size;
  
  console.log(`   Apparatus-level rows: ${apparatusCount.toLocaleString()}`);
  console.log(`   Unique incidents:      ${uniqueIncidents.size.toLocaleString()}`);
  console.log(`   Avg apparatus/incident: ${avgApparatusPerIncident.toFixed(2)}`);
  console.log();
  
  // Add incident_count to each record (for aggregation reference)
  const incidentCounts = {};
  for (const record of allRecords) {
    if (record.incident_id) {
      incidentCounts[record.incident_id] = (incidentCounts[record.incident_id] || 0) + 1;
    }
  }
  for (const record of allRecords) {
    record.incident_count = record.incident_id ? incidentCounts[record.incident_id] : 1;
  }

  // -------------------------------------------------------------------------
  // STEP 6: Build HOME STATION MAP (CRITICAL!)
  // -------------------------------------------------------------------------
  console.log('🏠 STEP 6: Building HOME STATION MAP (Most Critical Output!)');
  console.log('-'.repeat(80));
  console.log('   Using DEDUPLICATED incidents (not apparatus-level) to avoid bias');
  console.log();
  
  // Get deduplicated incidents for home station analysis
  // Each incident should only count once, regardless of how many apparatus responded
  const deduplicatedIncidents = [];
  const seenIncidentIds = new Set();
  
  for (const record of allRecords) {
    if (record.incident_id && !seenIncidentIds.has(record.incident_id) && record.district && record.station) {
      deduplicatedIncidents.push(record);
      seenIncidentIds.add(record.incident_id);
    }
  }
  
  console.log(`   Deduplicated incidents for analysis: ${deduplicatedIncidents.length.toLocaleString()}`);
  console.log();
  
  // Count station responses per district
  const districtStationCounts = {};
  
  for (const record of deduplicatedIncidents) {
    const district = record.district;
    const station = record.station;
    
    if (!district || !station) continue;
    
    if (!districtStationCounts[district]) {
      districtStationCounts[district] = {};
    }
    
    districtStationCounts[district][station] = (districtStationCounts[district][station] || 0) + 1;
  }
  
  // Determine home station for each district
  const homeStationMap = {};
  const homeStationDetails = [];
  
  for (const [district, stations] of Object.entries(districtStationCounts)) {
    const sorted = Object.entries(stations).sort((a, b) => b[1] - a[1]);
    const homeStation = sorted[0][0];
    const homeCount = sorted[0][1];
    const totalIncidents = sorted.reduce((sum, [_, count]) => sum + count, 0);
    const homePct = (homeCount / totalIncidents * 100).toFixed(1);
    
    homeStationMap[district] = homeStation;
    
    homeStationDetails.push({
      district,
      homeStation,
      homeCount,
      totalIncidents,
      homePct: parseFloat(homePct),
      otherStations: sorted.slice(1).map(([station, count]) => ({ station, count }))
    });
  }
  
  // Sort by district name for display
  homeStationDetails.sort((a, b) => {
    // Put mutual aid at the end
    const aIsMA = MUTUAL_AID_LOCATIONS.includes(a.district);
    const bIsMA = MUTUAL_AID_LOCATIONS.includes(b.district);
    if (aIsMA && !bIsMA) return 1;
    if (!aIsMA && bIsMA) return -1;
    return a.district.localeCompare(b.district);
  });
  
  // Print the home station table
  console.log('   District      | Home Station                      | Home % | Total Incidents');
  console.log('   ' + '-'.repeat(85));
  
  for (const detail of homeStationDetails) {
    const district = detail.district.padEnd(14);
    const station = detail.homeStation.padEnd(34);
    const pct = detail.homePct.toFixed(1).padStart(6) + '%';
    const total = detail.totalIncidents.toString().padStart(15);
    
    let flag = '';
    if (MUTUAL_AID_LOCATIONS.includes(detail.district)) {
      flag = ' 🤝';
    } else if (detail.homePct < 50) {
      flag = ' ⚠️ LOW';
    } else if (detail.homePct >= 80) {
      flag = ' ✅';
    }
    
    console.log(`   ${district} | ${station} | ${pct} | ${total}${flag}`);
  }
  
  console.log();
  console.log('   Legend: ✅ = Strong home station signal (≥80%)');
  console.log('           ⚠️  = Weak signal (<50%) - investigate');
  console.log('           🤝 = Mutual aid location (outside district system)');
  console.log();
  
  // Summary statistics
  const sugarLandDistricts = homeStationDetails.filter(d => !MUTUAL_AID_LOCATIONS.includes(d.district));
  const strongSignal = sugarLandDistricts.filter(d => d.homePct >= 80).length;
  const weakSignal = sugarLandDistricts.filter(d => d.homePct < 50).length;
  const avgHomePct = sugarLandDistricts.reduce((sum, d) => sum + d.homePct, 0) / sugarLandDistricts.length;
  
  console.log(`   📊 HOME STATION MAP Summary:`);
  console.log(`      Sugar Land districts analyzed: ${sugarLandDistricts.length}`);
  console.log(`      Strong home station signal (≥80%): ${strongSignal} (${(strongSignal/sugarLandDistricts.length*100).toFixed(0)}%)`);
  console.log(`      Weak home station signal (<50%): ${weakSignal}`);
  console.log(`      Average home station percentage: ${avgHomePct.toFixed(1)}%`);
  console.log();
  
  if (avgHomePct >= 70) {
    console.log('   ✅ THESIS CHECK: Home station patterns are clear. Cross-district analysis will be meaningful.');
  } else if (avgHomePct >= 50) {
    console.log('   ⚠️  THESIS WARNING: Home station signal is moderate. Some districts may use closest-available dispatch.');
  } else {
    console.log('   🚨 THESIS AT RISK: Home station signal is weak. Consider pivoting to "extended-range" analysis.');
  }
  console.log();

  // -------------------------------------------------------------------------
  // STEP 7: Flag Cross-District Deployments
  // -------------------------------------------------------------------------
  console.log('🚨 STEP 7: Flagging Cross-District Deployments');
  console.log('-'.repeat(80));
  
  let crossDistrictCount = 0;
  let hasHomeStation = 0;
  
  for (const record of allRecords) {
    const homeStation = homeStationMap[record.district];
    
    if (homeStation) {
      hasHomeStation++;
      record.home_station = homeStation;
      record.is_cross_district = (record.station !== homeStation);
      
      if (record.is_cross_district) {
        crossDistrictCount++;
      }
    } else {
      record.home_station = null;
      record.is_cross_district = null; // Can't determine without home station
    }
  }
  
  const crossDistrictRate = hasHomeStation > 0 ? (crossDistrictCount / hasHomeStation * 100) : 0;
  
  console.log(`   Records with home station mapping: ${hasHomeStation.toLocaleString()}`);
  console.log(`   Cross-district deployments: ${crossDistrictCount.toLocaleString()}`);
  console.log(`   Overall cross-district rate: ${crossDistrictRate.toFixed(2)}%`);
  console.log();
  
  if (crossDistrictRate >= 15 && crossDistrictRate <= 40) {
    console.log('   ✅ Cross-district rate is in ideal range (15-40%) for meaningful analysis.');
  } else if (crossDistrictRate < 5) {
    console.log('   ⚠️  Cross-district rate is very low (<5%). Signal may be too weak.');
  } else if (crossDistrictRate > 60) {
    console.log('   ⚠️  Cross-district rate is very high (>60%). Consider "extended-range" framing.');
  } else {
    console.log('   ℹ️  Cross-district rate is acceptable for analysis.');
  }
  console.log();

  // -------------------------------------------------------------------------
  // STEP 8: Final Statistics
  // -------------------------------------------------------------------------
  console.log('📈 STEP 8: Final Dataset Statistics');
  console.log('-'.repeat(80));
  
  // By service type
  const emsRecords = allRecords.filter(r => r.service_type === 'EMS');
  const fireRecords = allRecords.filter(r => r.service_type === 'Fire');
  
  console.log(`   By Service Type:`);
  console.log(`      EMS:  ${emsRecords.length.toLocaleString()} (${(emsRecords.length/allRecords.length*100).toFixed(1)}%)`);
  console.log(`      Fire: ${fireRecords.length.toLocaleString()} (${(fireRecords.length/allRecords.length*100).toFixed(1)}%)`);
  
  // By priority
  const priorityCounts = {};
  for (const r of allRecords) {
    const p = r.priority || 'NULL';
    priorityCounts[p] = (priorityCounts[p] || 0) + 1;
  }
  console.log();
  console.log(`   By Priority:`);
  for (const [priority, count] of Object.entries(priorityCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${priority.padEnd(40)}: ${count.toLocaleString()} (${(count/allRecords.length*100).toFixed(1)}%)`);
  }
  
  // By shift
  const shiftCounts = {};
  for (const r of allRecords) {
    const s = r.shift || 'NULL';
    shiftCounts[s] = (shiftCounts[s] || 0) + 1;
  }
  console.log();
  console.log(`   By Shift:`);
  for (const [shift, count] of Object.entries(shiftCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${shift.padEnd(10)}: ${count.toLocaleString()} (${(count/allRecords.length*100).toFixed(1)}%)`);
  }
  
  // Date range
  const dates = allRecords.filter(r => r.date).map(r => r.date).sort();
  console.log();
  console.log(`   Date Range:`);
  console.log(`      Earliest: ${dates[0]}`);
  console.log(`      Latest:   ${dates[dates.length - 1]}`);
  console.log();

  // Unique values
  const uniqueDistricts = new Set(allRecords.filter(r => r.district).map(r => r.district));
  const uniqueStations = new Set(allRecords.filter(r => r.station).map(r => r.station));
  const uniqueCities = new Set(allRecords.filter(r => r.city).map(r => r.city));
  
  console.log(`   Unique Values:`);
  console.log(`      Districts: ${uniqueDistricts.size}`);
  console.log(`      Stations:  ${uniqueStations.size}`);
  console.log(`      Cities:    ${uniqueCities.size}`);
  console.log();

  // -------------------------------------------------------------------------
  // STEP 9: Save Output
  // -------------------------------------------------------------------------
  console.log('💾 STEP 9: Saving processed data...');
  console.log('-'.repeat(80));
  
  // Ensure output directory exists
  if (!existsSync(PATHS.outputDir)) {
    mkdirSync(PATHS.outputDir, { recursive: true });
  }
  
  // Prepare output object with metadata
  const output = {
    metadata: {
      generated_at: new Date().toISOString(),
      total_records: allRecords.length,
      unique_incidents: uniqueIncidents.size,
      ems_records: emsRecords.length,
      fire_records: fireRecords.length,
      date_range: {
        start: dates[0],
        end: dates[dates.length - 1]
      },
      cross_district_rate: crossDistrictRate,
      home_station_avg_pct: avgHomePct
    },
    home_station_map: homeStationMap,
    home_station_details: homeStationDetails,
    records: allRecords
  };
  
  writeFileSync(PATHS.outputFile, JSON.stringify(output, null, 2));
  
  const fileSizeMB = (JSON.stringify(output).length / (1024 * 1024)).toFixed(2);
  console.log(`   ✅ Saved to: ${PATHS.outputFile}`);
  console.log(`   📦 File size: ${fileSizeMB} MB`);
  console.log();

  // -------------------------------------------------------------------------
  // DONE
  // -------------------------------------------------------------------------
  console.log('='.repeat(80));
  console.log('✅ STAGE 2 COMPLETE: Data preparation finished successfully!');
  console.log('='.repeat(80));
  console.log();
  console.log('📋 Next Steps:');
  console.log('   1. Review the HOME STATION MAP above - verify it makes sense');
  console.log('   2. Check cross-district rate is in acceptable range');
  console.log('   3. Run `npm run metrics` to build daily metrics');
  console.log();
}

// Run the script
main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
