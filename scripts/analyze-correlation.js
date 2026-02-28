/**
 * Stage 4: Correlation Analysis
 * Station Strain Atlas - Sugar Land Open Data Day 2026
 * 
 * This script analyzes correlations between cross-district deployment rates
 * and response times, with statistical significance testing.
 * 
 * IMPORTANT: Only 21 monthly data points, so statistical power is limited.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURATION
// ============================================================================

const PATHS = {
  monthlyMetrics: join(__dirname, '..', 'data', 'processed', 'monthly-metrics.json'),
  districtProfiles: join(__dirname, '..', 'data', 'processed', 'district-profiles.json'),
  output: join(__dirname, '..', 'data', 'processed', 'analysis-results.json')
};

// Month names for reporting
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];

// ============================================================================
// STATISTICAL FUNCTIONS
// ============================================================================

/**
 * Calculate Pearson correlation coefficient (r)
 */
function pearsonCorrelation(x, y) {
  const n = x.length;
  if (n !== y.length || n === 0) return null;
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);
  
  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
  
  if (denominator === 0) return null;
  return numerator / denominator;
}

/**
 * Calculate linear regression (slope, intercept)
 */
function linearRegression(x, y) {
  const n = x.length;
  if (n !== y.length || n === 0) return null;
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  
  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return null;
  
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  
  // Calculate R²
  const meanY = sumY / n;
  const ssRes = y.reduce((sum, yi, i) => sum + Math.pow(yi - (slope * x[i] + intercept), 2), 0);
  const ssTot = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
  const rSquared = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  
  return { slope, intercept, rSquared };
}

/**
 * Calculate p-value for correlation using t-test
 * t = r * sqrt((n-2)/(1-r²))
 * df = n - 2
 */
function calculatePValue(r, n) {
  if (r === null || Math.abs(r) >= 1) return null;
  if (n <= 2) return null;
  
  const t = r * Math.sqrt((n - 2) / (1 - r * r));
  const df = n - 2;
  
  // Use approximation for two-tailed p-value from t-distribution
  // For small samples, we use the incomplete beta function approximation
  const p = tDistributionPValue(t, df);
  return p;
}

/**
 * Approximate two-tailed p-value from t-distribution
 * Using Abramowitz and Stegun approximation
 */
function tDistributionPValue(t, df) {
  const x = df / (t * t + df);
  
  // For large df or moderate t, use normal approximation
  if (df > 30) {
    // Normal approximation
    const z = Math.abs(t);
    const p = 2 * (1 - normalCDF(z));
    return p;
  }
  
  // Use beta function approximation
  const p = incompleteBeta(df / 2, 0.5, x);
  return 2 * p; // Two-tailed
}

/**
 * Standard normal CDF approximation
 */
function normalCDF(x) {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.sqrt(2);
  
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  
  return 0.5 * (1.0 + sign * y);
}

/**
 * Incomplete beta function approximation (for p-value calculation)
 */
function incompleteBeta(a, b, x) {
  if (x < 0 || x > 1) return 0;
  
  const bt = (x === 0 || x === 1) 
    ? 0 
    : Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  
  if (x < (a + 1) / (a + b + 2)) {
    return bt * continuedFraction(a, b, x) / a;
  } else {
    return 1 - bt * continuedFraction(b, a, 1 - x) / b;
  }
}

/**
 * Continued fraction for incomplete beta
 */
function continuedFraction(a, b, x, maxIter = 200, eps = 1e-10) {
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - qab * x / qap;
  
  if (Math.abs(d) < eps) d = eps;
  d = 1 / d;
  let h = d;
  
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + aa / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    h *= d * c;
    
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + aa / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    
    const del = d * c;
    h *= del;
    
    if (Math.abs(del - 1) < eps) break;
  }
  
  return h;
}

/**
 * Log gamma function approximation
 */
function logGamma(x) {
  const cof = [
    76.18009172947146,
    -86.50532032941677,
    24.01409824083091,
    -1.231739572450155,
    0.1208650973866179e-2,
    -0.5395239384953e-5
  ];
  
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  
  for (let j = 0; j < 6; j++) {
    y += 1;
    ser += cof[j] / y;
  }
  
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

/**
 * Interpret signal strength based on R²
 */
function interpretSignalStrength(rSquared) {
  if (rSquared >= 0.3) return { level: 'Strong', color: '🟢', description: 'Meaningful relationship' };
  if (rSquared >= 0.1) return { level: 'Moderate', color: '🟡', description: 'Some relationship, may need more data' };
  return { level: 'Weak', color: '🔴', description: 'Little to no relationship' };
}

/**
 * Format p-value with significance stars
 */
function formatPValue(p) {
  if (p === null) return { text: 'N/A', stars: '', significant: false };
  
  let stars = '';
  let significant = false;
  
  if (p < 0.001) {
    stars = '***';
    significant = true;
  } else if (p < 0.01) {
    stars = '**';
    significant = true;
  } else if (p < 0.05) {
    stars = '*';
    significant = true;
  }
  
  return { text: p.toFixed(4), stars, significant };
}

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

function main() {
  console.log('='.repeat(80));
  console.log('STATION STRAIN ATLAS - Correlation Analysis');
  console.log('='.repeat(80));
  console.log();

  // -------------------------------------------------------------------------
  // STEP 1: Load Data
  // -------------------------------------------------------------------------
  console.log('📂 Loading processed data...');
  console.log('-'.repeat(80));
  
  let monthlyMetrics, districtProfiles;
  
  try {
    const metricsData = readFileSync(PATHS.monthlyMetrics, 'utf-8');
    monthlyMetrics = JSON.parse(metricsData);
    console.log(`   ✅ Monthly metrics loaded: ${monthlyMetrics.monthly_metrics.length} months`);
  } catch (e) {
    console.error(`   ❌ Error loading monthly metrics: ${e.message}`);
    process.exit(1);
  }
  
  try {
    const profilesData = readFileSync(PATHS.districtProfiles, 'utf-8');
    districtProfiles = JSON.parse(profilesData);
    console.log(`   ✅ District profiles loaded: ${Object.keys(districtProfiles.districts).length} districts`);
  } catch (e) {
    console.error(`   ❌ Error loading district profiles: ${e.message}`);
    process.exit(1);
  }
  
  const months = monthlyMetrics.monthly_metrics;
  const districts = districtProfiles.districts;
  console.log();

  // -------------------------------------------------------------------------
  // STEP 2: Monthly Correlations
  // -------------------------------------------------------------------------
  console.log('📊 STEP 1: Monthly Correlation Analysis');
  console.log('-'.repeat(80));
  console.log(`   Sample size: n = ${months.length} months`);
  console.log('   Note: With n=21, statistical power is limited. p-values are computed.');
  console.log();
  
  // Extract data arrays
  const crossDistrictRate = months.map(m => m.cross_district_rate);
  const emsResponseTime = months.map(m => m.ems_avg_response_time);
  const fireResponseTime = months.map(m => m.fire_avg_response_time);
  const totalIncidents = months.map(m => m.total_incidents);
  const emergentRate = months.map(m => m.emergent_rate);
  
  // Define correlations to test
  const correlations = [
    { name: 'Cross-District Rate vs EMS Response Time', x: crossDistrictRate, y: emsResponseTime, xLabel: 'Cross-District Rate', yLabel: 'EMS Response Time (min)' },
    { name: 'Cross-District Rate vs Fire Response Time', x: crossDistrictRate, y: fireResponseTime, xLabel: 'Cross-District Rate', yLabel: 'Fire Response Time (min)' },
    { name: 'Total Incidents vs EMS Response Time', x: totalIncidents, y: emsResponseTime, xLabel: 'Total Incidents', yLabel: 'EMS Response Time (min)' },
    { name: 'Total Incidents vs Fire Response Time', x: totalIncidents, y: fireResponseTime, xLabel: 'Total Incidents', yLabel: 'Fire Response Time (min)' },
    { name: 'Emergent Rate vs EMS Response Time', x: emergentRate, y: emsResponseTime, xLabel: 'Emergent Rate', yLabel: 'EMS Response Time (min)' }
  ];
  
  const correlationResults = [];
  
  console.log('   Correlation Results:');
  console.log('   ' + '-'.repeat(75));
  
  for (const corr of correlations) {
    // Filter out null values
    const validPairs = [];
    for (let i = 0; i < corr.x.length; i++) {
      if (corr.x[i] !== null && corr.y[i] !== null && !isNaN(corr.x[i]) && !isNaN(corr.y[i])) {
        validPairs.push({ x: corr.x[i], y: corr.y[i] });
      }
    }
    
    if (validPairs.length < 3) {
      console.log(`   ${corr.name}: Insufficient data`);
      continue;
    }
    
    const x = validPairs.map(p => p.x);
    const y = validPairs.map(p => p.y);
    const n = x.length;
    
    const r = pearsonCorrelation(x, y);
    const regression = linearRegression(x, y);
    const pValue = calculatePValue(r, n);
    const interpretation = interpretSignalStrength(regression.rSquared);
    const pFormatted = formatPValue(pValue);
    
    const result = {
      name: corr.name,
      xLabel: corr.xLabel,
      yLabel: corr.yLabel,
      n,
      r,
      rSquared: regression.rSquared,
      pValue,
      slope: regression.slope,
      intercept: regression.intercept,
      signalStrength: interpretation.level,
      significant: pFormatted.significant
    };
    
    correlationResults.push(result);
    
    console.log(`   ${corr.name}:`);
    console.log(`      n = ${n}, r = ${r.toFixed(4)}, R² = ${regression.rSquared.toFixed(4)}`);
    console.log(`      p-value = ${pFormatted.text} ${pFormatted.stars} ${pFormatted.significant ? '(significant)' : '(not significant at α=0.05)'}`);
    console.log(`      Signal: ${interpretation.color} ${interpretation.level} - ${interpretation.description}`);
    
    if (regression.rSquared > 0.1) {
      console.log(`      Regression: y = ${regression.slope.toFixed(4)}x + ${regression.intercept.toFixed(4)}`);
    }
    console.log();
  }

  // -------------------------------------------------------------------------
  // STEP 3: Seasonal Analysis
  // -------------------------------------------------------------------------
  console.log('📅 STEP 2: Seasonal Pattern Analysis');
  console.log('-'.repeat(80));
  
  // Group by quarter
  const quarters = { Q1: [], Q2: [], Q3: [], Q4: [] };
  const byMonth = {};
  
  for (const m of months) {
    const [year, month] = m.year_month.split('-');
    const monthNum = parseInt(month, 10);
    const quarter = monthNum <= 3 ? 'Q1' : monthNum <= 6 ? 'Q2' : monthNum <= 9 ? 'Q3' : 'Q4';
    
    quarters[quarter].push(m);
    
    const monthName = MONTH_NAMES[monthNum - 1];
    if (!byMonth[monthName]) {
      byMonth[monthName] = [];
    }
    byMonth[monthName].push(m);
  }
  
  console.log('   Quarterly Averages:');
  console.log('   ' + '-'.repeat(75));
  console.log('   Quarter | Months | Avg Cross-District | Avg EMS RT | Avg Fire RT | Incidents');
  console.log('   ' + '-'.repeat(75));
  
  const quarterlyData = [];
  
  for (const [q, qMonths] of Object.entries(quarters)) {
    if (qMonths.length === 0) continue;
    
    const avgCrossDistrict = qMonths.reduce((s, m) => s + m.cross_district_rate, 0) / qMonths.length;
    const avgEMS = qMonths.reduce((s, m) => s + (m.ems_avg_response_time || 0), 0) / qMonths.length;
    const avgFire = qMonths.reduce((s, m) => s + (m.fire_avg_response_time || 0), 0) / qMonths.length;
    const totalInc = qMonths.reduce((s, m) => s + m.total_incidents, 0);
    
    quarterlyData.push({
      quarter: q,
      months: qMonths.length,
      avgCrossDistrict,
      avgEMSResponseTime: avgEMS,
      avgFireResponseTime: avgFire,
      totalIncidents: totalInc
    });
    
    console.log(`   ${q.padEnd(7)} | ${String(qMonths.length).padStart(6)} | ${(avgCrossDistrict * 100).toFixed(1).padStart(6)}%          | ${avgEMS.toFixed(2).padStart(6)} min | ${avgFire.toFixed(2).padStart(7)} min | ${totalInc.toLocaleString()}`);
  }
  console.log();
  
  // Find extreme months
  const sortedByCrossDistrict = [...months].sort((a, b) => a.cross_district_rate - b.cross_district_rate);
  const sortedByEMS = [...months].filter(m => m.ems_avg_response_time).sort((a, b) => a.ems_avg_response_time - b.ems_avg_response_time);
  const sortedByFire = [...months].filter(m => m.fire_avg_response_time).sort((a, b) => a.fire_avg_response_time - b.fire_avg_response_time);
  
  console.log('   Extreme Months:');
  console.log('   ' + '-'.repeat(75));
  
  const lowestCD = sortedByCrossDistrict[0];
  const highestCD = sortedByCrossDistrict[sortedByCrossDistrict.length - 1];
  console.log(`   Lowest Cross-District Rate:  ${lowestCD.year_month} (${(lowestCD.cross_district_rate * 100).toFixed(1)}%)`);
  console.log(`   Highest Cross-District Rate: ${highestCD.year_month} (${(highestCD.cross_district_rate * 100).toFixed(1)}%)`);
  
  const lowestEMS = sortedByEMS[0];
  const highestEMS = sortedByEMS[sortedByEMS.length - 1];
  console.log(`   Lowest EMS Response Time:    ${lowestEMS.year_month} (${lowestEMS.ems_avg_response_time.toFixed(2)} min)`);
  console.log(`   Highest EMS Response Time:   ${highestEMS.year_month} (${highestEMS.ems_avg_response_time.toFixed(2)} min)`);
  
  const lowestFire = sortedByFire[0];
  const highestFire = sortedByFire[sortedByFire.length - 1];
  console.log(`   Lowest Fire Response Time:   ${lowestFire.year_month} (${lowestFire.fire_avg_response_time.toFixed(2)} min)`);
  console.log(`   Highest Fire Response Time:  ${highestFire.year_month} (${highestFire.fire_avg_response_time.toFixed(2)} min)`);
  console.log();
  
  // Check for seasonal pattern
  const qAverages = quarterlyData.map(q => q.avgCrossDistrict);
  const qRange = Math.max(...qAverages) - Math.min(...qAverages);
  
  console.log(`   Seasonal Pattern Assessment:`);
  if (qRange > 0.05) {
    console.log(`   🟡 Cross-district rate varies ${(qRange * 100).toFixed(1)}% across quarters - possible seasonal effect`);
  } else {
    console.log(`   🟢 Cross-district rate is relatively stable across quarters (${(qRange * 100).toFixed(1)}% variation)`);
  }
  console.log();

  // -------------------------------------------------------------------------
  // STEP 4: District-Level Analysis
  // -------------------------------------------------------------------------
  console.log('📍 STEP 3: District-Level Analysis');
  console.log('-'.repeat(80));
  
  // Filter districts with > 20 incidents to reduce noise
  const significantDistricts = Object.values(districts).filter(d => d.total_incidents > 20);
  
  console.log(`   Districts with > 20 incidents: ${significantDistricts.length} of ${Object.keys(districts).length}`);
  console.log();
  
  // Top 10 by cross-district rate
  const topStrain = [...significantDistricts]
    .sort((a, b) => b.cross_district_rate - a.cross_district_rate)
    .slice(0, 10);
  
  console.log('   Top 10 Districts by Cross-District Rate (n > 20):');
  console.log('   ' + '-'.repeat(75));
  console.log('   Rank | District | Home Station        | Incidents | Cross-District %');
  console.log('   ' + '-'.repeat(75));
  
  const topDistrictsData = [];
  
  topStrain.forEach((d, i) => {
    const rank = (i + 1).toString().padStart(4);
    const district = d.district.padEnd(9);
    const home = (d.home_station || 'N/A').substring(0, 20).padEnd(20);
    const incidents = d.total_incidents.toString().padStart(9);
    const rate = (d.cross_district_rate * 100).toFixed(1).padStart(6) + '%';
    
    console.log(`   ${rank} | ${district} | ${home} | ${incidents} | ${rate}`);
    
    topDistrictsData.push({
      rank: i + 1,
      district: d.district,
      home_station: d.home_station,
      total_incidents: d.total_incidents,
      cross_district_rate: d.cross_district_rate
    });
  });
  console.log();
  
  // Correlation: district incidents vs cross-district rate
  const districtIncidents = significantDistricts.map(d => d.total_incidents);
  const districtCrossRate = significantDistricts.map(d => d.cross_district_rate);
  
  const districtCorr = pearsonCorrelation(districtIncidents, districtCrossRate);
  const districtRegress = linearRegression(districtIncidents, districtCrossRate);
  const districtPValue = calculatePValue(districtCorr, significantDistricts.length);
  const districtInterpret = interpretSignalStrength(districtRegress.rSquared);
  const districtPFormatted = formatPValue(districtPValue);
  
  console.log('   District-Level Correlation:');
  console.log(`   Incidents vs Cross-District Rate:`);
  console.log(`      n = ${significantDistricts.length} districts`);
  console.log(`      r = ${districtCorr.toFixed(4)}, R² = ${districtRegress.rSquared.toFixed(4)}`);
  console.log(`      p-value = ${districtPFormatted.text} ${districtPFormatted.stars}`);
  console.log(`      Signal: ${districtInterpret.color} ${districtInterpret.level}`);
  
  if (districtCorr > 0) {
    console.log(`      Interpretation: Busier districts tend to have HIGHER cross-district rates`);
  } else if (districtCorr < 0) {
    console.log(`      Interpretation: Busier districts tend to have LOWER cross-district rates`);
  }
  console.log();
  
  // Station export analysis (which stations' home districts have highest strain)
  const stationStrain = {};
  
  for (const d of significantDistricts) {
    if (d.home_station) {
      if (!stationStrain[d.home_station]) {
        stationStrain[d.home_station] = { districts: [], totalIncidents: 0, totalCrossDistrict: 0 };
      }
      stationStrain[d.home_station].districts.push(d.district);
      stationStrain[d.home_station].totalIncidents += d.total_incidents;
      stationStrain[d.home_station].totalCrossDistrict += d.total_incidents * d.cross_district_rate;
    }
  }
  
  const stationRankings = Object.entries(stationStrain)
    .map(([station, data]) => ({
      station,
      districtCount: data.districts.length,
      totalIncidents: data.totalIncidents,
      avgCrossDistrictRate: data.totalCrossDistrict / data.totalIncidents
    }))
    .sort((a, b) => b.avgCrossDistrictRate - a.avgCrossDistrictRate);
  
  console.log('   Stations by Average Cross-District Rate of Their Home Districts:');
  console.log('   (Higher = station is more often "exporting" to cover other areas)');
  console.log('   ' + '-'.repeat(75));
  
  const stationExportData = [];
  
  for (const s of stationRankings.slice(0, 10)) {
    console.log(`   ${s.station.padEnd(35)} | ${s.districtCount} districts | ${(s.avgCrossDistrictRate * 100).toFixed(1)}% avg`);
    stationExportData.push(s);
  }
  console.log();

  // -------------------------------------------------------------------------
  // STEP 5: Generate Verdict
  // -------------------------------------------------------------------------
  console.log('='.repeat(80));
  console.log('📋 VERDICT & RECOMMENDATIONS');
  console.log('='.repeat(80));
  console.log();
  
  // Find the main correlation result
  const mainCorrResult = correlationResults.find(c => c.name === 'Cross-District Rate vs EMS Response Time');
  const mainRSquared = mainCorrResult ? mainCorrResult.rSquared : 0;
  const mainSignificant = mainCorrResult ? mainCorrResult.significant : false;
  
  console.log('1️⃣  MONTHLY CORRELATION ANALYSIS:');
  console.log('-'.repeat(80));
  
  if (mainSignificant && mainRSquared >= 0.1) {
    console.log(`   🟢 The correlation between cross-district rate and EMS response time is`);
    console.log(`      statistically significant (p < 0.05) with R² = ${mainRSquared.toFixed(4)}.`);
    console.log(`      This SUPPORTS the thesis that system strain affects response times.`);
  } else if (mainRSquared >= 0.1) {
    console.log(`   🟡 There is a ${interpretSignalStrength(mainRSquared).level.toLowerCase()} relationship between cross-district rate`);
    console.log(`      and EMS response time (R² = ${mainRSquared.toFixed(4)}), but it is not statistically`);
    console.log(`      significant with only n=21 months. Consider collecting more data.`);
  } else {
    console.log(`   🔴 The correlation between cross-district rate and response time is WEAK`);
    console.log(`      (R² = ${mainRSquared.toFixed(4)}). This suggests Sugar Land's dispatch system is`);
    console.log(`      RESILIENT - response times remain stable even under strain.`);
    console.log();
    console.log(`   📝 PIVOT NARRATIVE: "Sugar Land's dispatch system absorbs strain without`);
    console.log(`      degrading performance. The district strain patterns provide operational`);
    console.log(`      intelligence for proactive resource allocation."`);
  }
  console.log();
  
  console.log('2️⃣  DISTRICTS TO HIGHLIGHT IN DASHBOARD:');
  console.log('-'.repeat(80));
  
  const highStrainDistricts = topDistrictsData.slice(0, 5);
  console.log('   Priority focus areas (high cross-district rates with sufficient data):');
  
  for (const d of highStrainDistricts) {
    console.log(`   • District ${d.district}: ${(d.cross_district_rate * 100).toFixed(1)}% cross-district (${d.total_incidents} incidents)`);
    console.log(`     Home Station: ${d.home_station}`);
  }
  console.log();
  
  console.log('3️⃣  NARRATIVE FRAMING RECOMMENDATION:');
  console.log('-'.repeat(80));
  
  if (mainRSquared >= 0.2 && mainSignificant) {
    console.log('   📊 STRONG CORRELATION APPROACH:');
    console.log('   "When cross-district deployments rise, response times measurably increase.');
    console.log('    Districts on the far side of barriers (US-90, rail lines) show the highest');
    console.log('    strain. Pre-positioning units during peak hours would reduce response times."');
  } else if (mainRSquared >= 0.1) {
    console.log('   📊 MODERATE CORRELATION APPROACH:');
    console.log('   "Cross-district deployment patterns reveal operational strain. While response');
    console.log('    times remain relatively stable, the data shows which districts stretch the');
    console.log('    system most. This intelligence helps proactive resource allocation."');
  } else {
    console.log('   📊 RESILIENCE APPROACH:');
    console.log('   "Sugar Land\'s dispatch system demonstrates remarkable resilience. Even when');
    console.log('    units are deployed cross-district at high rates, response times stay stable.');
    console.log('    The district strain patterns highlight where to add capacity as the city grows."');
  }
  console.log();
  
  console.log('4️⃣  KEY STATISTICS SUMMARY:');
  console.log('-'.repeat(80));
  console.log(`   • Data Period: ${months[0].year_month} to ${months[months.length - 1].year_month} (${months.length} months)`);
  console.log(`   • Total Incidents: ${months.reduce((s, m) => s + m.total_incidents, 0).toLocaleString()}`);
  console.log(`   • Overall Cross-District Rate: ${(months.reduce((s, m) => s + m.cross_district_rate, 0) / months.length * 100).toFixed(1)}%`);
  console.log(`   • Average EMS Response Time: ${(months.reduce((s, m) => s + (m.ems_avg_response_time || 0), 0) / months.length).toFixed(2)} min`);
  console.log(`   • Districts Analyzed: ${Object.keys(districts).length}`);
  console.log();

  // -------------------------------------------------------------------------
  // STEP 6: Save Results
  // -------------------------------------------------------------------------
  console.log('💾 Saving analysis results...');
  console.log('-'.repeat(80));
  
  const analysisResults = {
    metadata: {
      generated_at: new Date().toISOString(),
      data_period: {
        start: months[0].year_month,
        end: months[months.length - 1].year_month,
        total_months: months.length
      }
    },
    correlation_analysis: {
      monthly_correlations: correlationResults,
      main_correlation: {
        name: 'Cross-District Rate vs EMS Response Time',
        r: mainCorrResult?.r || 0,
        rSquared: mainRSquared,
        pValue: mainCorrResult?.pValue || null,
        significant: mainSignificant,
        signal_strength: interpretSignalStrength(mainRSquared).level
      }
    },
    seasonal_analysis: {
      quarterly_data: quarterlyData,
      extreme_months: {
        lowest_cross_district: { month: lowestCD.year_month, value: lowestCD.cross_district_rate },
        highest_cross_district: { month: highestCD.year_month, value: highestCD.cross_district_rate },
        lowest_ems_response: { month: lowestEMS.year_month, value: lowestEMS.ems_avg_response_time },
        highest_ems_response: { month: highestEMS.year_month, value: highestEMS.ems_avg_response_time },
        lowest_fire_response: { month: lowestFire.year_month, value: lowestFire.fire_avg_response_time },
        highest_fire_response: { month: highestFire.year_month, value: highestFire.fire_avg_response_time }
      },
      seasonal_variation: qRange
    },
    district_analysis: {
      top_strain_districts: topDistrictsData,
      district_correlation: {
        name: 'District Incidents vs Cross-District Rate',
        n: significantDistricts.length,
        r: districtCorr,
        rSquared: districtRegress.rSquared,
        pValue: districtPValue
      },
      station_export_rankings: stationExportData
    },
    verdict: {
      thesis_supported: mainSignificant && mainRSquared >= 0.1,
      correlation_strength: interpretSignalStrength(mainRSquared).level,
      recommended_narrative: mainRSquared >= 0.2 ? 'strong_correlation' : 
                            mainRSquared >= 0.1 ? 'moderate_correlation' : 'resilience',
      highlight_districts: highStrainDistricts.map(d => d.district)
    }
  };
  
  writeFileSync(PATHS.output, JSON.stringify(analysisResults, null, 2));
  
  console.log(`   ✅ Analysis results saved to: ${PATHS.output}`);
  console.log();

  // -------------------------------------------------------------------------
  // DONE
  // -------------------------------------------------------------------------
  console.log('='.repeat(80));
  console.log('✅ CORRELATION ANALYSIS COMPLETE');
  console.log('='.repeat(80));
  console.log();
}

// Run the script
main();
