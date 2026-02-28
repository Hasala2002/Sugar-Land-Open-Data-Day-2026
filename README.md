# Station Strain Atlas

**Open Data Day 2026 Datathon Entry | Sugar Land, TX**

## Live Demo

🔗 **https://sugarlandemsfireanalysis.netlify.app**

### Highlights

- Interactive station-strain map focused on Sugar Land city limits
- Station-by-station strain ranking with top high-strain district callouts
- Station drill-down profile with incident mix and export-load metrics
- System overview and recommendations panel for rapid judge review

## The Problem

Sugar Land's Fire-EMS system serves a city divided by US-90, US-59/I-69, and active freight rail corridors. When the nearest emergency unit is already committed, backup must navigate these barriers — adding time when every second counts.

## My Approach

I analyzed **26,489 Fire-EMS incident records** from the Sugar Land Insights Open Data Portal to identify:

- **Where** the system is under strain (which districts rely on non-home stations most)
- **When** strain peaks (time of day, day of week, seasonal patterns)
- **Whether** strain correlates with slower response times

## The Dashboard

An interactive web dashboard featuring:

- Choropleth map of district-level strain
- Time-series of daily response times vs. cross-district deployment rates
- Correlation analysis with statistical validation
- Per-district drill-down profiles
- Actionable pre-positioning recommendations

## Tech Stack

- React + Vite
- Mapbox (maps)
- Recharts (charts)
- Tailwind CSS
- Node.js (data processing)

## Data Sources

- [Sugar Land Insights Open Data Portal](https://data.sugarlandtx.gov) — EMS Incidents, Fire Incidents, EMS Daily Response Times, Fire Daily Response Times, GIS Fire Coverage
- Railroad crossing locations (FRA / OpenStreetMap)

## Getting Started

```bash
# Install dependencies
npm install

# Run data pipeline (after placing CSVs in data/raw/)
npm run pipeline

# Copy processed data for the dashboard
cp data/processed/*.json public/data/

# Start development server
npm run dev
```

## License

This project was created for the Sugar Land Open Data Day 2026 Datathon.
