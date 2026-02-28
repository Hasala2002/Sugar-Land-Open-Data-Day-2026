import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { Map, Source, Layer, Marker } from 'react-map-gl';
import mapboxgl from 'mapbox-gl';
import { getStrainColor, formatNumber, formatPercent } from '../utils/dataLoader';
import 'mapbox-gl/dist/mapbox-gl.css';

// Get short station label from full name (e.g., "Sugar Land Fire Station 1" -> "S1")
function getShortLabel(stationName) {
  const match = stationName?.match(/Station (\d)/);
  return match ? `S${match[1]}` : stationName;
}

// Get display name for station
function getStationDisplayName(stationName) {
  return stationName?.replace('Sugar Land Fire ', '') || stationName;
}

// Custom station marker component with building icon
function StationMarker({ station, isSelected, onClick }) {
  const color = getStrainColor((station.avg_cross_district_rate || 0) * 100);
  const label = getShortLabel(station.station_id);

  return (
    <Marker
      longitude={station.lng || station.longitude}
      latitude={station.lat || station.latitude}
      anchor="bottom"
      onClick={onClick}
    >
      <div
        className={`station-marker ${isSelected ? 'selected' : ''}`}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        {/* Fire station icon SVG */}
        <svg
          width="32"
          height="32"
          viewBox="0 0 50 50"
          fill={color}
          style={{
            filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.5))',
            animation: isSelected ? 'pulse 2s infinite' : 'none',
          }}
        >
          {/* Fire station icon */}
          <path d="M25.335 24.297s-4.839 3.893-4.839 7.04c0 1.409 2.074 2.817 4.839 2.817 2.763 0 4.837-1.408 4.837-2.817 0-3.26-4.837-7.04-4.837-7.04zm17.641-7.116c.28-3.428 1.274-6.575 3.024-9.459l-6.719-6.722c-2.122 1.828-4.54 2.84-7.28 3.019-2.51.227-4.889-.25-7.126-1.435-2.302 1.146-4.672 1.625-7.143 1.435-2.555-.229-4.862-1.135-6.927-2.741l-6.738 6.719c1.657 2.926 2.58 5.987 2.761 9.184.086 1.472-.334 3.497-1.276 6.117-.493 1.452-.865 2.711-1.12 3.764-.236 1.045-.383 1.895-.431 2.531-.035 2.79.748 5.311 2.353 7.55 1.254 1.635 3.322 3.441 6.194 5.415 3.143 1.6 5.574 2.638 7.277 3.082l1.412.656c.445.212.921.42 1.417.647 1.071.641 1.823 1.337 2.221 2.056.485-.777 1.254-1.456 2.278-2.056.722-.315 1.331-.589 1.822-.828l1.066-.476c.364-.181.843-.388 1.419-.616.581-.229 1.302-.509 2.16-.821 1.659-.587 2.869-1.143 3.635-1.645 2.786-1.974 4.823-3.75 6.118-5.34 1.663-2.248 2.47-4.779 2.433-7.625-.099-1.274-.638-3.313-1.617-6.09-.933-2.705-1.347-4.805-1.213-6.321zm-17.641 19.789c-6.107 0-11.75-5.044-11.75-11.265 0-4.225 3.23-8.216 4.147-9.857l2.764 4.225 4.839-7.04 4.837 7.04 2.768-4.225c.914 1.641 4.147 5.632 4.147 9.857 0 6.221-5.644 11.265-11.752 11.265z" />
        </svg>
        {/* Label on top-center of icon */}
        <span
          style={{
            position: 'absolute',
            top: '-8px',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: '10px',
            fontWeight: '700',
            color: 'white',
            textShadow: '0 1px 2px rgba(0,0,0,0.8)',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          {label}
        </span>
      </div>
    </Marker>
  );
}

function MapView({
  stationLocations,
  districts,
  railCrossings,
  districtProfiles,
  selectedStation,
  onStationSelect,
}) {
  const [showInfrastructure, setShowInfrastructure] = useState(false);
  const [hoveredDistrict, setHoveredDistrict] = useState(null);
  const mapRef = useRef(null);

  // Mapbox token from environment
  const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

  // Initial viewport (centered on Sugar Land; will be overridden by fitBounds)
  const [viewState, setViewState] = useState({
    longitude: -95.6350,
    latitude: 29.5900,
    zoom: 11,
  });

  // Memoize railroad and highway features
  const { railroadFeatures, highwayFeatures } = useMemo(() => {
    if (!railCrossings?.features) return { railroadFeatures: [], highwayFeatures: [] };
    
    return {
      railroadFeatures: railCrossings.features.filter(f => f.properties?.type === 'railroad'),
      highwayFeatures: railCrossings.features.filter(f => f.properties?.type === 'highway'),
    };
  }, [railCrossings]);

  // Create GeoJSON collections
  const railroadGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: railroadFeatures,
  }), [railroadFeatures]);

  const highwayGeoJSON = useMemo(() => ({
    type: 'FeatureCollection',
    features: highwayFeatures,
  }), [highwayFeatures]);

  // Fit bounds to districts on load
  useEffect(() => {
    if (mapRef.current && districts?.features?.length > 0) {
      const map = mapRef.current.getMap();
      const coordinates = districts.features.flatMap(feature => {
        if (feature.geometry.type === 'Polygon') {
          return feature.geometry.coordinates[0];
        } else if (feature.geometry.type === 'MultiPolygon') {
          return feature.geometry.coordinates.flat(2);
        }
        return [];
      });

      if (coordinates.length > 0) {
        const bounds = coordinates.reduce(
          (bounds, coord) => bounds.extend(coord),
          new mapboxgl.LngLatBounds(coordinates[0], coordinates[0])
        );
        
        map.fitBounds(bounds, { padding: 40, duration: 1000 });
      }
    }
  }, [districts]);

  // District layer style with dynamic coloring
  const districtLayerStyle = useMemo(() => ({
    id: 'districts-fill',
    type: 'fill',
    paint: {
      'fill-color': [
        'case',
        ['==', ['get', 'station_id'], selectedStation || ''],
        ['get', 'fill_color'],
        selectedStation ? 'rgba(255, 255, 255, 0.05)' : ['get', 'fill_color']
      ],
      'fill-opacity': [
        'case',
        ['==', ['get', 'station_id'], selectedStation || ''],
        0.45,
        selectedStation ? 0.12 : 0.25
      ],
    },
  }), [selectedStation]);

  const districtBorderStyle = useMemo(() => ({
    id: 'districts-line',
    type: 'line',
    paint: {
      'line-color': '#ffffff',
      'line-width': [
        'case',
        ['==', ['get', 'station_id'], selectedStation || ''],
        2,
        1
      ],
      'line-opacity': [
        'case',
        ['==', ['get', 'station_id'], selectedStation || ''],
        0.9,
        0.3
      ],
    },
  }), [selectedStation]);

  // Enhance districts with fill colors
  const enhancedDistricts = useMemo(() => {
    if (!districts?.features) return null;
    
    return {
      ...districts,
      features: districts.features.map(feature => ({
        ...feature,
        properties: {
          ...feature.properties,
          fill_color: getStrainColor(feature.properties?.avg_cross_district_rate || 0),
        },
      })),
    };
  }, [districts]);

  // Handle district click
  const onMapClick = useCallback((event) => {
    if (event.features && event.features.length > 0) {
      const feature = event.features[0];
      if (feature.layer.id === 'districts-fill') {
        const stationId = feature.properties.station_id;
        onStationSelect(stationId === selectedStation ? null : stationId);
      }
    }
  }, [selectedStation, onStationSelect]);

  // Handle hover
  const onMapHover = useCallback((event) => {
    if (event.features && event.features.length > 0) {
      const feature = event.features[0];
      if (feature.layer.id === 'districts-fill') {
        setHoveredDistrict(feature.properties.station_id);
        mapRef.current.getMap().getCanvas().style.cursor = 'pointer';
      }
    } else {
      setHoveredDistrict(null);
      mapRef.current.getMap().getCanvas().style.cursor = '';
    }
  }, []);

  if (!stationLocations || !districts || !MAPBOX_TOKEN) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <span className="text-secondary text-sm">
          {!MAPBOX_TOKEN ? 'Mapbox token not configured' : 'Loading map...'}
        </span>
      </div>
    );
  }

  return (
    <div className="h-full relative">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={evt => setViewState(evt.viewState)}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        mapboxAccessToken={MAPBOX_TOKEN}
        interactiveLayerIds={['districts-fill']}
        onClick={onMapClick}
        onMouseMove={onMapHover}
        attributionControl={true}
      >
        {/* District polygons */}
        {enhancedDistricts && (
          <Source id="districts" type="geojson" data={enhancedDistricts}>
            <Layer {...districtLayerStyle} />
            <Layer {...districtBorderStyle} />
          </Source>
        )}

        {/* Infrastructure - Railroads */}
        {showInfrastructure && railroadFeatures.length > 0 && (
          <Source id="railroads" type="geojson" data={railroadGeoJSON}>
            <Layer
              id="railroads-line"
              type="line"
              paint={{
                'line-color': '#dc2626',
                'line-width': 2,
                'line-opacity': 0.6,
                'line-dasharray': [2, 1],
              }}
            />
          </Source>
        )}

        {/* Infrastructure - Highways */}
        {showInfrastructure && highwayFeatures.length > 0 && (
          <Source id="highways" type="geojson" data={highwayGeoJSON}>
            <Layer
              id="highways-line"
              type="line"
              paint={{
                'line-color': '#6b7280',
                'line-width': 2,
                'line-opacity': 0.4,
              }}
            />
          </Source>
        )}

        {/* Station markers */}
        {stationLocations.stations?.map((station) => {
          const lat = station.lat || station.latitude;
          const lng = station.lng || station.longitude;
          
          if (lat === undefined || lng === undefined) {
            console.warn(`Missing coordinates for station: ${station.station_id}`);
            return null;
          }
          
          return (
            <StationMarker
              key={station.station_id}
              station={station}
              isSelected={selectedStation === station.station_id}
              onClick={() => {
                onStationSelect(
                  station.station_id === selectedStation ? null : station.station_id
                );
              }}
            />
          );
        })}
      </Map>

      {/* Infrastructure Toggle */}
      <button
        onClick={() => setShowInfrastructure(prev => !prev)}
        className="absolute top-4 right-4 z-10 px-3 py-1.5 bg-surface/90 border border-border rounded text-xs font-mono text-secondary hover:text-primary hover:border-border/80 transition-colors"
        style={{ backdropFilter: 'blur(4px)' }}
      >
        {showInfrastructure ? '✓' : '○'} Infrastructure
      </button>

      {/* Map Legend */}
      <div 
        className="absolute bottom-4 right-4 z-10 p-3 rounded"
        style={{ 
          background: 'rgba(10, 15, 26, 0.9)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <div className="text-label uppercase text-secondary mb-2">Cross-district rate</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-secondary">Low</span>
          <div 
            className="w-24 h-2 rounded"
            style={{
              background: 'linear-gradient(to right, #22c55e, #eab308, #ef4444)',
            }}
          />
          <span className="text-xs text-secondary">High</span>
        </div>
      </div>
    </div>
  );
}

export default MapView;
