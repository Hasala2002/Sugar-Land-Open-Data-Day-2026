/**
 * Stage 3: Build Monthly Metrics and District Profiles
 * Station Strain Atlas - Sugar Land Open Data Day 2026
 * 
 * This script:
 * 1. Reads combined-incidents.json from Stage 2
 * 2. Reads BOTH monthly response time files with different date formats
 * 3. Excludes mutual aid and truncated district codes
 * 4. Aggregates incidents to MONTHLY level (not daily)
 * 5. Joins with response times on YYYY-MM
 * 6. Builds district profile summaries
 * 7. Outputs to monthly-metrics.json and district-profiles.json
 */

import { parse } from 'csv-parse/sync';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const PATHS = {
  combinedIncidents: join(__dirname, '..', 'data', 'processed', 'combined-incidents.json'),
  emsResponseTimes: join(__dirname, '..', 'data', 'raw', 'ems-daily-response-times.csv'),
  fireResponseTimes: join(__dirname, '..', 'data', 'raw', 'fire-daily-response-times.csv'),
  outputDir: join(__dirname, '..', 'data', 'processed'),
  monthlyMetricsOutput: join(__dirname, '..', 'data', 'processed', 'monthly-metrics.json'),
  districtProfilesOutput: join(__dirname, '..', 'data', 'processed', 'district-profiles.json')
};

// Truncated district codes that represent incomplete/outside data
const TRUNCATED_DISTRICTS = ['STA', 'HOU', 'RIC', 'MIS', 'NOR'];

// Month abbreviation to number mapping
const MONTH_MAP = {
  'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
  'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
  'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
};

// Day names for reporting
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseCSV(filepath) {
  const content = readFileSync(filepath, 'utf-8');
  const cleanContent = content.replace(/^\uFEFF/, '');
  return parse(cleanContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });
}

/**
 * Parse EMS response time date format: "23-Jan" → "2023-01"
 */
function parseEMSDate(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 2) return null;
  
  const year = parts[0]; // "23"
  const month = parts[1]; // "Jan"
  
  if (!MONTH_MAP[month]) return null;
  
  // Convert 2-digit year to 4-digit
  const fullYear = `20${year}`;
  return `${fullYear}-${MONTH_MAP[month]}`;
}

/**
 * Parse Fire response time date format: "Jan-23" → "2023-01"
 */
function parseFireDate(dateStr) {
  const parts = dateStr.split('-');
  if (parts.length !== 2) return null;
  
  const month = parts[0]; // "Jan"
  const year = parts[1]; // "23"
  
  if (!MONTH_MAP[month]) return null;
  
  // Convert 2-digit year to 4-digit
  const fullYear = `20${year}`;
  return `${fullYear}-${MONTH_MAP[month]}`;
}

/**
 * Parse response time from "M:SS" format to decimal minutes
 * Example: "6:48" → 6.80, "7:01" → 7.02
 */
function parseResponseTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  
  const parts = timeStr.split(':');
  if (parts.length !== 2) return null;
  
  const minutes = parseInt(parts[0], 10);
  const seconds = parseInt(parts[1], 10);
  
  if (isNaN(minutes) || isNaN(seconds)) return null;
  
  return minutes + (seconds / 60);
}

/**
 * Check if a district code is truncated/incomplete
 */
function isTruncatedDistrict(district) {
  if (!district) return false;
  return TRUNCATED_DISTRICTS.includes(district.toUpperCase());
}

/**
 * Get the array index with maximum value
 */
function getMaxIndex(arr) {
  if (!arr || arr.length === 0) return -1;
  let maxIdx = 0;
  let maxVal = arr[0];
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] > maxVal) {
      maxVal = arr[i];
      maxIdx = i;
    }
  }
  return maxIdx;
}

/**
 * Count occurrences of each value in an array
 */
function countBy(arr, keyFn) {
  const counts = {};
  for (const item of arr) {
    const key = keyFn(item);
    if (key) {
      counts[key] = (counts[key] || 0) + 1;
    }
  }
  return counts;
}

/**
 * Get top N items from an object of counts
 */
function getTopN(countsObj, n) {
  return Object.entries(countsObj)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ item: key, count }));
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

function main() {
  console.log('='.repeat(80));
  console.log('STATION STRAIN ATLAS - Stage 3: Monthly Metrics & District Profiles');
  console.log('='.repeat(80));
  console.log();

  // -------------------------------------------------------------------------
  // STEP 1: Load Combined Incidents
  // -------------------------------------------------------------------------
  console.log('📂 STEP 1: Loading combined incidents from Stage 2...');
  console.log('-'.repeat(80));
  
  let combinedData;
  try {
    const rawData = readFileSync(PATHS.combinedIncidents, 'utf-8');
    combinedData = JSON.parse(rawData);
    console.log(`   ✅ Loaded: ${PATHS.combinedIncidents}`);
    console.log(`   📊 Total apparatus records: ${combinedData.records.length.toLocaleString()}`);
    console.log(`   📊 Unique incidents: ${combinedData.metadata.unique_incidents.toLocaleString()}`);
    console.log(`   📅 Date range: ${combinedData.metadata.date_range.start} to ${combinedData.metadata.date_range.end}`);
  } catch (e) {
    console.error(`   ❌ Error loading combined incidents: ${e.message}`);
    process.exit(1);
  }
  
  const allRecords = combinedData.records;
  const homeStationMap = combinedData.home_station_map;
  console.log();

  // -------------------------------------------------------------------------
  // STEP 2: Load and Parse Response Time Files
  // -------------------------------------------------------------------------
  console.log('⏱️  STEP 2: Loading monthly response time files...');
  console.log('-'.repeat(80));
  
  // Parse EMS response times
  let emsResponseData;
  try {
    const emsCSV = parseCSV(PATHS.emsResponseTimes);
    console.log(`   ✅ EMS response times loaded: ${emsCSV.length} months`);
    
    emsResponseData = {};
    for (const row of emsCSV) {
      const yearMonth = parseEMSDate(row['Date']);
      const responseTime = parseResponseTime(row['Avg Response']);
      
      if (yearMonth && responseTime !== null) {
        emsResponseData[yearMonth] = responseTime;
      }
    }
    
    console.log(`   📅 EMS date format: "23-Jan" → "2023-01"`);
    console.log(`   📊 EMS months parsed: ${Object.keys(emsResponseData).length}`);
  } catch (e) {
    console.error(`   ❌ Error loading EMS response times: ${e.message}`);
    process.exit(1);
  }
  
  // Parse Fire response times
  let fireResponseData;
  try {
    const fireCSV = parseCSV(PATHS.fireResponseTimes);
    console.log(`   ✅ Fire response times loaded: ${fireCSV.length} months`);
    
    fireResponseData = {};
    for (const row of fireCSV) {
      const yearMonth = parseFireDate(row['Date']);
      const responseTime = parseResponseTime(row['Avg Response']);
      
      if (yearMonth && responseTime !== null) {
        fireResponseData[yearMonth] = responseTime;
      }
    }
    
    console.log(`   📅 Fire date format: "Jan-23" → "2023-01"`);
    console.log(`   📊 Fire months parsed: ${Object.keys(fireResponseData).length}`);
  } catch (e) {
    console.error(`   ❌ Error loading Fire response times: ${e.message}`);
    process.exit(1);
  }
  
  // Show sample parsed values
  console.log();
  console.log('   Sample parsed response times:');
  const sampleMonths = Object.keys(emsResponseData).slice(0, 5);
  for (const month of sampleMonths) {
    const ems = emsResponseData[month];
    const fire = fireResponseData[month];
    console.log(`      ${month}: EMS=${ems.toFixed(2)}min, Fire=${fire ? fire.toFixed(2) + 'min' : 'N/A'}`);
  }
  console.log();

  // -------------------------------------------------------------------------
  // STEP 3: Filter Records (Exclude Mutual Aid & Truncated Codes)
  // -------------------------------------------------------------------------
  console.log('🔍 STEP 3: Filtering records (excluding mutual aid & truncated codes)...');
  console.log('-'.repeat(80));
  
  const filteredRecords = allRecords.filter(record => {
    // Exclude mutual aid
    if (record.is_mutual_aid === true) {
      return false;
    }
    
    // Exclude truncated district codes
    if (isTruncatedDistrict(record.district)) {
      return false;
    }
    
    // Exclude records without district
    if (!record.district || record.district.trim() === '') {
      return false;
    }
    
    return true;
  });
  
  const excludedCount = allRecords.length - filteredRecords.length;
  console.log(`   Original records:      ${allRecords.length.toLocaleString()}`);
  console.log(`   Excluded records:      ${excludedCount.toLocaleString()}`);
  console.log(`   Filtered records:      ${filteredRecords.length.toLocaleString()}`);
  console.log();
  
  // Count excluded by reason
  const mutualAidExcluded = allRecords.filter(r => r.is_mutual_aid === true).length;
  const truncatedExcluded = allRecords.filter(r => isTruncatedDistrict(r.district)).length;
  const noDistrictExcluded = allRecords.filter(r => !r.district || r.district.trim() === '').length;
  
  console.log('   Exclusion breakdown:');
  console.log(`      Mutual aid locations:    ${mutualAidExcluded.toLocaleString()}`);
  console.log(`      Truncated district codes: ${truncatedExcluded.toLocaleString()}`);
  console.log(`      Missing district:         ${noDistrictExcluded.toLocaleString()}`);
  console.log();

  // -------------------------------------------------------------------------
  // STEP 4: Aggregate to Monthly Level
  // -------------------------------------------------------------------------
  console.log('📊 STEP 4: Aggregating to MONTHLY level...');
  console.log('-'.repeat(80));
  
  const monthlyMetrics = {};
  const incidentIdsByMonth = {}; // For deduplication
  
  // Initialize all months in date range
  const allMonths = new Set();
  for (const record of filteredRecords) {
    if (record.year_month) {
      allMonths.add(record.year_month);
    }
  }
  
  // Initialize each month
  for (const month of allMonths) {
    monthlyMetrics[month] = {
      year_month: month,
      total_incidents: 0, // Will be deduplicated
      total_apparatus_dispatches: 0,
      ems_incidents: 0,
      fire_incidents: 0,
      emergent_incidents: 0,
      cross_district_count: 0,
      incidents_by_district: {},
      incidents_by_hour: new Array(24).fill(0),
      incidents_by_day_of_week: new Array(7).fill(0),
      _incident_ids: new Set() // Temporary for deduplication
    };
    incidentIdsByMonth[month] = new Set();
  }
  
  // Aggregate apparatus-level data
  for (const record of filteredRecords) {
    const month = record.year_month;
    if (!month || !monthlyMetrics[month]) continue;
    
    const m = monthlyMetrics[month];
    
    // Count apparatus dispatches (all rows)
    m.total_apparatus_dispatches++;
    
    // Track unique incidents for deduplication
    if (record.incident_id) {
      m._incident_ids.add(record.incident_id);
    }
    
    // Count by district
    if (record.district) {
      m.incidents_by_district[record.district] = (m.incidents_by_district[record.district] || 0) + 1;
    }
    
    // Count by hour (use apparatus-level for distribution)
    if (record.hour !== null && record.hour !== undefined) {
      m.incidents_by_hour[record.hour]++;
    }
    
    // Count by day of week (use apparatus-level for distribution)
    if (record.day_of_week !== null && record.day_of_week !== undefined) {
      m.incidents_by_day_of_week[record.day_of_week]++;
    }
  }
  
  // Now process deduplicated counts for service type, priority, cross-district
  // We need to process each incident only once
  const processedIncidents = new Set();
  
  for (const record of filteredRecords) {
    const month = record.year_month;
    const incidentId = record.incident_id;
    
    if (!month || !incidentId) continue;
    if (processedIncidents.has(incidentId)) continue;
    
    processedIncidents.add(incidentId);
    const m = monthlyMetrics[month];
    
    // Count unique incidents
    m.total_incidents++;
    
    // Count by service type (deduplicated)
    if (record.service_type === 'EMS') {
      m.ems_incidents++;
    } else if (record.service_type === 'Fire') {
      m.fire_incidents++;
    }
    
    // Count emergent incidents (deduplicated)
    if (record.priority && record.priority.toLowerCase().includes('emergent')) {
      m.emergent_incidents++;
    }
    
    // Count cross-district deployments (deduplicated)
    if (record.is_cross_district === true) {
      m.cross_district_count++;
    }
  }
  
  // Calculate derived metrics and clean up
  for (const month of Object.keys(monthlyMetrics)) {
    const m = monthlyMetrics[month];
    
    // Calculate rates
    m.cross_district_rate = m.total_incidents > 0 
      ? m.cross_district_count / m.total_incidents 
      : 0;
    m.emergent_rate = m.total_incidents > 0 
      ? m.emergent_incidents / m.total_incidents 
      : 0;
    
    // Calculate average apparatus per incident
    m.avg_apparatus_per_incident = m.total_incidents > 0 
      ? m.total_apparatus_dispatches / m.total_incidents 
      : 0;
    
    // Find busiest hour and day
    m.busiest_hour = getMaxIndex(m.incidents_by_hour);
    m.busiest_day_of_week = getMaxIndex(m.incidents_by_day_of_week);
    
    // Remove temporary tracking set
    delete m._incident_ids;
  }
  
  console.log(`   ✅ Months aggregated: ${Object.keys(monthlyMetrics).length}`);
  console.log();
  
  // Show sample month
  const sampleMonth = Object.keys(monthlyMetrics).sort()[0];
  const sample = monthlyMetrics[sampleMonth];
  console.log('   Sample month metrics:');
  console.log(`      ${sampleMonth}:`);
  console.log(`         Total incidents:       ${sample.total_incidents}`);
  console.log(`         Apparatus dispatches:  ${sample.total_apparatus_dispatches}`);
  console.log(`         EMS/Fire:              ${sample.ems_incidents}/${sample.fire_incidents}`);
  console.log(`         Emergent rate:         ${(sample.emergent_rate * 100).toFixed(1)}%`);
  console.log(`         Cross-district rate:   ${(sample.cross_district_rate * 100).toFixed(1)}%`);
  console.log(`         Busiest hour:          ${sample.busiest_hour}:00`);
  console.log(`         Busiest day:           ${DAY_NAMES[sample.busiest_day_of_week]}`);
  console.log();

  // -------------------------------------------------------------------------
  // STEP 5: Join with Response Times
  // -------------------------------------------------------------------------
  console.log('🔗 STEP 5: Joining with monthly response times...');
  console.log('-'.repeat(80));
  
  let emsMatchCount = 0;
  let fireMatchCount = 0;
  let bothMatchCount = 0;
  let noMatchCount = 0;
  const gaps = [];
  
  const sortedMonths = Object.keys(monthlyMetrics).sort();
  
  for (const month of sortedMonths) {
    const m = monthlyMetrics[month];
    
    // Join EMS response time
    if (emsResponseData[month] !== undefined) {
      m.ems_avg_response_time = emsResponseData[month];
      emsMatchCount++;
    } else {
      m.ems_avg_response_time = null;
      gaps.push({ month, type: 'EMS' });
    }
    
    // Join Fire response time
    if (fireResponseData[month] !== undefined) {
      m.fire_avg_response_time = fireResponseData[month];
      fireMatchCount++;
    } else {
      m.fire_avg_response_time = null;
      gaps.push({ month, type: 'Fire' });
    }
    
    // Count both matches
    if (m.ems_avg_response_time !== null && m.fire_avg_response_time !== null) {
      bothMatchCount++;
    } else if (m.ems_avg_response_time === null && m.fire_avg_response_time === null) {
      noMatchCount++;
    }
  }
  
  console.log(`   Incident data months:     ${sortedMonths.length}`);
  console.log(`   EMS response time months: ${Object.keys(emsResponseData).length}`);
  console.log(`   Fire response time months: ${Object.keys(fireResponseData).length}`);
  console.log();
  console.log(`   Match Summary:`);
  console.log(`      Months with EMS data:     ${emsMatchCount}`);
  console.log(`      Months with Fire data:    ${fireMatchCount}`);
  console.log(`      Months with BOTH:         ${bothMatchCount}`);
  console.log(`      Months with NEITHER:      ${noMatchCount}`);
  
  // Report gaps
  if (gaps.length > 0) {
    console.log();
    console.log(`   ⚠️  Response Time Gaps (${gaps.length} total):`);
    
    // Group by month for cleaner display
    const emsGaps = gaps.filter(g => g.type === 'EMS').map(g => g.month);
    const fireGaps = gaps.filter(g => g.type === 'Fire').map(g => g.month);
    
    if (emsGaps.length > 0 && emsGaps.length <= 10) {
      console.log(`      Missing EMS: ${emsGaps.join(', ')}`);
    } else if (emsGaps.length > 10) {
      console.log(`      Missing EMS: ${emsGaps.length} months (outside response time data range)`);
    }
    
    if (fireGaps.length > 0 && fireGaps.length <= 10) {
      console.log(`      Missing Fire: ${fireGaps.join(', ')}`);
    } else if (fireGaps.length > 10) {
      console.log(`      Missing Fire: ${fireGaps.length} months (outside response time data range)`);
    }
  }
  console.log();
  
  // Show overlap analysis
  const incidentStart = sortedMonths[0];
  const incidentEnd = sortedMonths[sortedMonths.length - 1];
  const responseStart = Object.keys(emsResponseData).sort()[0];
  const responseEnd = Object.keys(emsResponseData).sort().slice(-1)[0];
  
  console.log('   Date Range Comparison:');
  console.log(`      Incident data:        ${incidentStart} to ${incidentEnd}`);
  console.log(`      Response time data:   ${responseStart} to ${responseEnd}`);
  console.log(`      Overlap:              ${bothMatchCount} months`);
  console.log();

  // -------------------------------------------------------------------------
  // STEP 6: Build District Profiles
  // -------------------------------------------------------------------------
  console.log('📍 STEP 6: Building district profiles...');
  console.log('-'.repeat(80));
  
  // Get unique Sugar Land districts
  const sugarLandDistricts = [...new Set(
    filteredRecords
      .filter(r => r.district && !isTruncatedDistrict(r.district))
      .map(r => r.district)
  )].sort();
  
  console.log(`   Sugar Land districts to profile: ${sugarLandDistricts.length}`);
  console.log();
  
  const districtProfiles = {};
  
  for (const district of sugarLandDistricts) {
    // Get all apparatus-level records for this district
    const districtApparatus = filteredRecords.filter(r => r.district === district);
    
    // Get deduplicated incidents for this district
    const incidentIds = new Set(districtApparatus.map(r => r.incident_id).filter(id => id));
    const totalIncidents = incidentIds.size;
    
    // Get deduplicated records (first occurrence of each incident)
    const seenIds = new Set();
    const districtIncidents = districtApparatus.filter(r => {
      if (!r.incident_id || seenIds.has(r.incident_id)) return false;
      seenIds.add(r.incident_id);
      return true;
    });
    
    // Cross-district at incident level
    const crossDistrictIncidents = districtIncidents.filter(r => r.is_cross_district === true).length;
    const crossDistrictRate = totalIncidents > 0 ? crossDistrictIncidents / totalIncidents : 0;
    
    // Cross-district at apparatus level (for comparison)
    const crossDistrictApparatus = districtApparatus.filter(r => r.is_cross_district === true).length;
    const crossDistrictApparatusRate = districtApparatus.length > 0 
      ? crossDistrictApparatus / districtApparatus.length 
      : 0;
    
    // Priority breakdown (deduplicated)
    const priorityBreakdown = countBy(districtIncidents, r => r.priority);
    
    // Incident type top 10 (deduplicated)
    const incidentTypeCounts = countBy(districtIncidents, r => r.incident_type);
    const incidentTypeTop10 = getTopN(incidentTypeCounts, 10);
    
    // Hourly distribution (use apparatus-level for better signal)
    const hourlyDistribution = new Array(24).fill(0);
    for (const r of districtApparatus) {
      if (r.hour !== null && r.hour !== undefined) {
        hourlyDistribution[r.hour]++;
      }
    }
    
    // Day of week distribution (use apparatus-level)
    const dayOfWeekDistribution = new Array(7).fill(0);
    for (const r of districtApparatus) {
      if (r.day_of_week !== null && r.day_of_week !== undefined) {
        dayOfWeekDistribution[r.day_of_week]++;
      }
    }
    
    // Shift breakdown (deduplicated)
    const shiftBreakdown = countBy(districtIncidents, r => r.shift);
    
    // Find busiest hour and day
    const busiestHour = getMaxIndex(hourlyDistribution);
    const busiestDayOfWeek = getMaxIndex(dayOfWeekDistribution);
    
    // Monthly trend for this district
    const monthlyTrendMap = {};
    const monthlyCrossDistrictMap = {};
    
    for (const r of districtApparatus) {
      if (!r.year_month) continue;
      monthlyTrendMap[r.year_month] = (monthlyTrendMap[r.year_month] || 0) + 1;
    }
    
    // Track cross-district by month (deduplicated)
    const seenIdsByMonth = {};
    for (const r of districtIncidents) {
      if (!r.year_month) continue;
      if (!seenIdsByMonth[r.year_month]) {
        seenIdsByMonth[r.year_month] = new Set();
      }
      
      if (!seenIdsByMonth[r.year_month].has(r.incident_id)) {
        seenIdsByMonth[r.year_month].add(r.incident_id);
        if (!monthlyCrossDistrictMap[r.year_month]) {
          monthlyCrossDistrictMap[r.year_month] = { total: 0, cross: 0 };
        }
        monthlyCrossDistrictMap[r.year_month].total++;
        if (r.is_cross_district === true) {
          monthlyCrossDistrictMap[r.year_month].cross++;
        }
      }
    }
    
    const monthlyTrend = Object.keys(monthlyTrendMap).sort().map(month => ({
      month,
      incidents: monthlyTrendMap[month],
      cross_district_rate: monthlyCrossDistrictMap[month] 
        ? monthlyCrossDistrictMap[month].cross / monthlyCrossDistrictMap[month].total
        : 0
    }));
    
    // Service type breakdown (deduplicated)
    const serviceTypeBreakdown = countBy(districtIncidents, r => r.service_type);
    
    districtProfiles[district] = {
      district,
      home_station: homeStationMap[district] || null,
      total_incidents: totalIncidents,
      total_apparatus_dispatches: districtApparatus.length,
      cross_district_rate: crossDistrictRate,
      cross_district_apparatus_rate: crossDistrictApparatusRate,
      priority_breakdown: priorityBreakdown,
      incident_type_top10: incidentTypeTop10,
      hourly_distribution: hourlyDistribution,
      day_of_week_distribution: dayOfWeekDistribution,
      shift_breakdown: shiftBreakdown,
      busiest_hour: busiestHour,
      busiest_day_of_week: busiestDayOfWeek,
      busiest_day_name: DAY_NAMES[busiestDayOfWeek],
      monthly_trend: monthlyTrend,
      service_type_breakdown: serviceTypeBreakdown
    };
  }
  
  console.log(`   ✅ District profiles created: ${Object.keys(districtProfiles).length}`);
  console.log();
  
  // Show top districts by cross-district rate
  const topStrainDistricts = Object.values(districtProfiles)
    .sort((a, b) => b.cross_district_rate - a.cross_district_rate)
    .slice(0, 10);
  
  console.log('   Top 10 Districts by Cross-District Rate:');
  console.log('   ' + '-'.repeat(70));
  console.log('   District    | Home Station | Incidents | Cross-District %');
  console.log('   ' + '-'.repeat(70));
  
  for (const d of topStrainDistricts) {
    const district = d.district.padEnd(12);
    const home = (d.home_station || 'N/A').padEnd(12);
    const incidents = d.total_incidents.toString().padStart(9);
    const rate = (d.cross_district_rate * 100).toFixed(1).padStart(5) + '%';
    console.log(`   ${district} | ${home} | ${incidents} | ${rate}`);
  }
  console.log();

  // -------------------------------------------------------------------------
  // STEP 7: Summary Statistics
  // -------------------------------------------------------------------------
  console.log('📈 STEP 7: Summary Statistics');
  console.log('-'.repeat(80));
  
  // Overall cross-district rate (deduplicated)
  let totalIncidentsAll = 0;
  let totalCrossDistrictAll = 0;
  
  for (const month of Object.keys(monthlyMetrics)) {
    totalIncidentsAll += monthlyMetrics[month].total_incidents;
    totalCrossDistrictAll += monthlyMetrics[month].cross_district_count;
  }
  
  const overallCrossDistrictRate = totalIncidentsAll > 0 
    ? totalCrossDistrictAll / totalIncidentsAll 
    : 0;
  
  console.log(`   Total unique incidents (filtered):     ${totalIncidentsAll.toLocaleString()}`);
  console.log(`   Total apparatus dispatches:            ${filteredRecords.length.toLocaleString()}`);
  console.log(`   Overall cross-district rate:           ${(overallCrossDistrictRate * 100).toFixed(2)}%`);
  console.log(`   Months with incident data:             ${Object.keys(monthlyMetrics).length}`);
  console.log(`   Months with response time data:        ${bothMatchCount}`);
  console.log(`   Districts profiled:                    ${Object.keys(districtProfiles).length}`);
  
  // Date range
  console.log();
  console.log(`   Date Range:`);
  console.log(`      Earliest: ${sortedMonths[0]}`);
  console.log(`      Latest:   ${sortedMonths[sortedMonths.length - 1]}`);
  console.log();

  // -------------------------------------------------------------------------
  // STEP 8: Save Outputs
  // -------------------------------------------------------------------------
  console.log('💾 STEP 8: Saving processed data...');
  console.log('-'.repeat(80));
  
  // Prepare monthly metrics output
  const monthlyMetricsArray = Object.values(monthlyMetrics).sort((a, b) => 
    a.year_month.localeCompare(b.year_month)
  );
  
  const monthlyMetricsOutput = {
    metadata: {
      generated_at: new Date().toISOString(),
      total_months: monthlyMetricsArray.length,
      months_with_response_times: bothMatchCount,
      date_range: {
        start: sortedMonths[0],
        end: sortedMonths[sortedMonths.length - 1]
      },
      total_unique_incidents: totalIncidentsAll,
      total_apparatus_dispatches: filteredRecords.length,
      overall_cross_district_rate: overallCrossDistrictRate,
      districts_analyzed: Object.keys(districtProfiles).length
    },
    monthly_metrics: monthlyMetricsArray
  };
  
  writeFileSync(
    PATHS.monthlyMetricsOutput, 
    JSON.stringify(monthlyMetricsOutput, null, 2)
  );
  
  const monthlyFileSizeMB = (JSON.stringify(monthlyMetricsOutput).length / (1024 * 1024)).toFixed(2);
  console.log(`   ✅ Monthly metrics saved to: ${PATHS.monthlyMetricsOutput}`);
  console.log(`   📦 File size: ${monthlyFileSizeMB} MB`);
  
  // Prepare district profiles output
  const districtProfilesOutput = {
    metadata: {
      generated_at: new Date().toISOString(),
      total_districts: Object.keys(districtProfiles).length,
      total_incidents: totalIncidentsAll
    },
    districts: districtProfiles
  };
  
  writeFileSync(
    PATHS.districtProfilesOutput, 
    JSON.stringify(districtProfilesOutput, null, 2)
  );
  
  const districtFileSizeMB = (JSON.stringify(districtProfilesOutput).length / (1024 * 1024)).toFixed(2);
  console.log(`   ✅ District profiles saved to: ${PATHS.districtProfilesOutput}`);
  console.log(`   📦 File size: ${districtFileSizeMB} MB`);
  console.log();

  // -------------------------------------------------------------------------
  // DONE
  // -------------------------------------------------------------------------
  console.log('='.repeat(80));
  console.log('✅ STAGE 3 COMPLETE: Monthly metrics & district profiles built successfully!');
  console.log('='.repeat(80));
  console.log();
  console.log('📋 Key Outputs:');
  console.log(`   • monthly-metrics.json - ${monthlyMetricsArray.length} months of aggregated data`);
  console.log(`   • district-profiles.json - ${Object.keys(districtProfiles).length} district profiles`);
  console.log();
  console.log('📊 Next Steps:');
  console.log('   1. Review district profiles for strain patterns');
  console.log('   2. Verify response time join coverage');
  console.log('   3. Begin building React dashboard components');
  console.log();
}

// Run the script
main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
