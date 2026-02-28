import { useMemo } from 'react';
import { AreaChart, Area, XAxis, ResponsiveContainer, Line, ComposedChart } from 'recharts';
import { getStrainColor } from '../utils/dataLoader';

function TimeSeriesStrip({ monthlyMetrics }) {
  // Process monthly data for the chart
  const chartData = useMemo(() => {
    if (!monthlyMetrics || !Array.isArray(monthlyMetrics)) return [];
    
    return monthlyMetrics.map((month, idx) => {
      const isoMonth = month.month || month.year_month;
      const date = isoMonth ? new Date(`${isoMonth}-01`) : null;
      const monthLabel = date
        ? date.toLocaleDateString('en-US', { month: 'short' })
        : `M${idx + 1}`;
      const crossRate =
        month.avg_cross_district_rate ??
        month.cross_district_rate ??
        0;
      const emsResponse =
        month.avg_ems_response_time ??
        month.ems_avg_response_time ??
        null;
      
      return {
        month: monthLabel,
        monthIndex: idx,
        crossDistrictRate: crossRate,
        responseTime: emsResponse,
        fullMonth: isoMonth,
      };
    });
  }, [monthlyMetrics]);

  // Get month initials for x-axis
  const monthLabels = chartData.map(d => d.month.charAt(0));

  if (chartData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="text-secondary text-xs">No monthly data available</span>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center px-4 py-2">
      {/* Legend */}
      <div className="flex flex-col gap-1 mr-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-0.5 bg-white/60"></div>
          <span className="text-xs text-secondary">Response time</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-strain-medium"></div>
          <span className="text-xs text-secondary">Cross-district rate</span>
        </div>
      </div>
      
      {/* Chart */}
      <div className="flex-1 h-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
          >
            <XAxis 
              dataKey="monthIndex"
              tickFormatter={(idx) => monthLabels[idx] || ''}
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'rgba(241, 245, 249, 0.4)', fontSize: 9, fontFamily: 'IBM Plex Mono' }}
              interval={0}
              height={16}
            />
            <Area
              type="monotone"
              dataKey="crossDistrictRate"
              stroke="#eab308"
              fill="#eab308"
              fillOpacity={0.3}
              strokeWidth={1.5}
            />
            <Line
              type="monotone"
              dataKey="responseTime"
              stroke="rgba(255, 255, 255, 0.6)"
              strokeWidth={1}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default TimeSeriesStrip;
