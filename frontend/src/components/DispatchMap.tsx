import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Navigation, Map as MapIcon, Satellite } from 'lucide-react';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

interface DispatchMapProps {
  callerLatitude: number;
  callerLongitude: number;
  callerAddress?: string;
  selectedType: 'hospital' | 'police' | 'fire';
  onStationsFound?: (stations: EmergencyStation[]) => void;
}

export interface DispatchMapRef {
  searchNearestStations: () => Promise<void>;
  flyToStation: (station: EmergencyStation) => void;
}

export interface EmergencyStation {
  id: string;
  name: string;
  type: 'hospital' | 'police' | 'fire';
  latitude: number;
  longitude: number;
  distance: number;
  address: string;
  duration?: string;
}

const EMERGENCY_COLORS = {
  hospital: '#3b82f6', // Blue
  police: '#22c55e',   // Green
  fire: '#ef4444'      // Red
};

export const DispatchMap = forwardRef<DispatchMapRef, DispatchMapProps>(({ 
  callerLatitude, 
  callerLongitude, 
  callerAddress,
  selectedType,
  onStationsFound
}, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const callerMarker = useRef<mapboxgl.Marker | null>(null);
  const stationMarkers = useRef<mapboxgl.Marker[]>([]);
  const routeLayers = useRef<string[]>([]);

  const [nearestStations, setNearestStations] = useState<EmergencyStation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite'>('streets');
  const [hasSearched, setHasSearched] = useState(false);

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    searchNearestStations: async () => {
      await fetchNearestStations(selectedType);
    },
    flyToStation: (station: EmergencyStation) => {
      if (!map.current) return;
      
      map.current.flyTo({
        center: [station.longitude, station.latitude],
        zoom: 15,
        duration: 1500
      });

      // Show popup for the station
      const marker = stationMarkers.current.find(m => {
        const lngLat = m.getLngLat();
        return lngLat.lat === station.latitude && lngLat.lng === station.longitude;
      });
      if (marker) {
        const popup = marker.getPopup();
        if (popup) {
          popup.addTo(map.current);
        }
      }
    }
  }));

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/navigation-v1',
      center: [callerLongitude, callerLatitude],
      zoom: 12,
      attributionControl: false,
    });

    // Add caller marker (orange)
    callerMarker.current = new mapboxgl.Marker({
      color: '#fb923c',
      scale: 1.2
    })
      .setLngLat([callerLongitude, callerLatitude])
      .setPopup(
        new mapboxgl.Popup({ offset: 25 })
          .setHTML(`
            <div style="padding: 8px;">
              <div style="font-weight: 600; font-size: 13px; color: #1a1a1a; margin-bottom: 4px;">
                Caller Location
              </div>
              <div style="font-size: 11px; color: #666;">
                ${callerAddress || 'Location received'}
              </div>
            </div>
          `)
      )
      .addTo(map.current);

    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Fetch nearest emergency stations using Mapbox/Overpass API
  const fetchNearestStations = async (type: 'hospital' | 'police' | 'fire') => {
    if (!map.current) return;

    console.log('🚁 DISPATCH MAP DEBUG:');
    console.log('📍 Searching for:', type);
    console.log('📍 Caller coordinates:', callerLatitude, callerLongitude);
    console.log('🗺️ Mapbox token available:', !!mapboxgl.accessToken);

    setIsLoading(true);
    setHasSearched(true);

    try {
      // Use Overpass API to find real emergency services
      const overpassQuery = getOverpassQuery(type, callerLatitude, callerLongitude);
      const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

      console.log('🔍 Overpass API URL:', overpassUrl);

      const response = await fetch(overpassUrl);
      
      if (!response.ok) {
        console.error('❌ Overpass API error:', response.status, response.statusText);
        throw new Error(`Overpass API error: ${response.status}`);
      }
      
      const data = await response.json();
      console.log('📊 Overpass API response:', data);

      if (data.elements && data.elements.length > 0) {
        // Calculate distances and sort
        const stationsPromises = data.elements.slice(0, 10).map(async (element: any) => {
          const lat = element.lat || element.center?.lat;
          const lon = element.lon || element.center?.lon;
          
          if (!lat || !lon) return null;
          
          const distance = calculateDistance(callerLatitude, callerLongitude, lat, lon);

          // Get REAL address using reverse geocoding
          let address = 'Address not available';
          try {
            if (mapboxgl.accessToken && mapboxgl.accessToken !== 'your_mapbox_token_here') {
              const geocodeResponse = await fetch(
                `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${mapboxgl.accessToken}&limit=1`
              );
              
              if (geocodeResponse.ok) {
                const geocodeData = await geocodeResponse.json();
                if (geocodeData.features && geocodeData.features.length > 0) {
                  address = geocodeData.features[0].place_name;
                }
              } else {
                console.warn('⚠️ Geocoding API error:', geocodeResponse.status);
              }
            }
          } catch (error) {
            console.error('❌ Geocoding error:', error);
          }

          // Get route duration
          let duration = 'N/A';
          try {
            const routeData = await fetchRoute(lat, lon);
            if (routeData && routeData.duration) {
              const mins = Math.round(routeData.duration / 60);
              duration = `${mins} min`;
            }
          } catch (error) {
            console.error('Route duration error:', error);
          }

          return {
            id: element.id.toString(),
            name: element.tags?.name || `${type.charAt(0).toUpperCase() + type.slice(1)} Station`,
            type,
            latitude: lat,
            longitude: lon,
            distance,
            address,
            duration
          };
        });

        const stationsResults = await Promise.all(stationsPromises);
        const stations = stationsResults.filter(s => s !== null) as EmergencyStation[];
        
        stations.sort((a, b) => a.distance - b.distance);
        const topStations = stations.slice(0, 5);
        setNearestStations(topStations);
        onStationsFound?.(topStations);
      } else {
        // Fallback to demo data if Overpass API fails
        console.log('⚠️ No results from Overpass API, using demo data');
        const demoStations = getDemoStations(type);
        console.log('🏥 Generated demo stations:', demoStations);
        setNearestStations(demoStations);
        onStationsFound?.(demoStations);
      }
    } catch (error) {
      console.error('❌ Error fetching stations from Overpass API:', error);
      // Use demo data as fallback
      console.log('🔄 Falling back to demo data');
      const demoStations = getDemoStations(type);
      console.log('🏥 Demo stations fallback:', demoStations);
      setNearestStations(demoStations);
      onStationsFound?.(demoStations);
    } finally {
      setIsLoading(false);
      console.log('✅ Station search completed');
    }
  };

  // Get Overpass API query for different emergency types
  const getOverpassQuery = (type: 'hospital' | 'police' | 'fire', lat: number, lon: number) => {
    const radius = 15000; // 15km radius for better coverage
    let amenity = '';

    switch (type) {
      case 'hospital':
        amenity = 'hospital';
        break;
      case 'police':
        amenity = 'police';
        break;
      case 'fire':
        amenity = 'fire_station';
        break;
    }

    return `
      [out:json][timeout:25];
      (
        node["amenity"="${amenity}"](around:${radius},${lat},${lon});
        way["amenity"="${amenity}"](around:${radius},${lat},${lon});
        relation["amenity"="${amenity}"](around:${radius},${lat},${lon});
      );
      out center;
    `;
  };

  // Demo stations fallback (using actual coordinates near caller)
  const getDemoStations = (type: 'hospital' | 'police' | 'fire'): EmergencyStation[] => {
    const baseStations = {
      hospital: [
        { name: 'City General Hospital', lat: callerLatitude + 0.02, lon: callerLongitude + 0.01 },
        { name: 'Medical Center', lat: callerLatitude - 0.015, lon: callerLongitude + 0.025 },
        { name: 'Emergency Care Hospital', lat: callerLatitude + 0.03, lon: callerLongitude - 0.02 },
        { name: 'Community Hospital', lat: callerLatitude - 0.025, lon: callerLongitude - 0.015 },
        { name: 'Regional Medical', lat: callerLatitude + 0.01, lon: callerLongitude + 0.03 }
      ],
      police: [
        { name: '1st Precinct', lat: callerLatitude + 0.015, lon: callerLongitude + 0.02 },
        { name: '2nd Precinct', lat: callerLatitude - 0.02, lon: callerLongitude + 0.01 },
        { name: '3rd Precinct', lat: callerLatitude + 0.025, lon: callerLongitude - 0.015 },
        { name: 'Police Headquarters', lat: callerLatitude - 0.01, lon: callerLongitude - 0.025 },
        { name: 'North Station', lat: callerLatitude + 0.03, lon: callerLongitude + 0.005 }
      ],
      fire: [
        { name: 'Fire Station 1', lat: callerLatitude + 0.018, lon: callerLongitude + 0.015 },
        { name: 'Fire Station 2', lat: callerLatitude - 0.022, lon: callerLongitude + 0.018 },
        { name: 'Fire Station 3', lat: callerLatitude + 0.028, lon: callerLongitude - 0.012 },
        { name: 'Central Fire', lat: callerLatitude - 0.015, lon: callerLongitude - 0.02 },
        { name: 'Fire Rescue 5', lat: callerLatitude + 0.012, lon: callerLongitude + 0.028 }
      ]
    };

    return baseStations[type].map((station, idx) => ({
      id: `demo-${idx}`,
      name: station.name,
      type,
      latitude: station.lat,
      longitude: station.lon,
      distance: calculateDistance(callerLatitude, callerLongitude, station.lat, station.lon),
      address: 'Demo Address'
    })).sort((a, b) => a.distance - b.distance);
  };

  // Calculate distance (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Fetch routing directions from Mapbox
  const fetchRoute = async (stationLat: number, stationLon: number): Promise<any> => {
    try {
      // Check if we have a valid access token
      if (!mapboxgl.accessToken || mapboxgl.accessToken === 'your_mapbox_token_here') {
        console.warn('⚠️ Invalid Mapbox token, skipping route fetch');
        return null;
      }

      const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${callerLongitude},${callerLatitude};${stationLon},${stationLat}?geometries=geojson&access_token=${mapboxgl.accessToken}`;
      console.log('🗺️ Fetching route from:', url);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error('❌ Route API error:', response.status, response.statusText);
        return null;
      }
      
      const data = await response.json();
      console.log('✅ Route data received:', data);
      
      return data.routes && data.routes.length > 0 ? data.routes[0] : null;
    } catch (error) {
      console.error('❌ Error fetching route:', error);
      return null;
    }
  };

  // Recenter map to caller location
  const recenterMap = () => {
    if (map.current) {
      map.current.flyTo({
        center: [callerLongitude, callerLatitude],
        zoom: 12,
        duration: 1000
      });
    }
  };

  // Redraw routes on the map
  const redrawRoutes = async (stations: EmergencyStation[]) => {
    if (!map.current) return;

    // Clear existing route layers (including shadow and border layers)
    routeLayers.current.forEach(layerId => {
      const layerIds = [layerId, `${layerId}-shadow`, `${layerId}-border`];
      layerIds.forEach(id => {
        if (map.current?.getLayer(id)) {
          map.current.removeLayer(id);
        }
      });
      if (map.current?.getSource(layerId)) {
        map.current.removeSource(layerId);
      }
    });
    routeLayers.current = [];

    // Redraw routes for each station
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i];
      const routeData = await fetchRoute(station.latitude, station.longitude);
      
      if (routeData && routeData.geometry && map.current) {
        const layerId = `route-${station.id}`;
        routeLayers.current.push(layerId);

        map.current.addSource(layerId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: routeData.geometry,
            properties: {}
          }
        });

        // Add shadow layer (outer glow)
        map.current.addLayer({
          id: `${layerId}-shadow`,
          type: 'line',
          source: layerId,
          paint: {
            'line-color': '#000000',
            'line-width': i === 0 ? 16 : 14,
            'line-opacity': 0.25,
            'line-blur': 6
          }
        });

        // Add border layer (white outline)
        map.current.addLayer({
          id: `${layerId}-border`,
          type: 'line',
          source: layerId,
          paint: {
            'line-color': '#ffffff',
            'line-width': i === 0 ? 12 : 10,
            'line-opacity': 1
          }
        });

        // Add main route layer (solid colored line)
        map.current.addLayer({
          id: layerId,
          type: 'line',
          source: layerId,
          paint: {
            'line-color': EMERGENCY_COLORS[station.type],
            'line-width': i === 0 ? 9 : 7,
            'line-opacity': 1
          }
        });
      }
    }
  };

  // Update map style when toggle changes
  useEffect(() => {
    if (map.current) {
      const styleUrl = mapStyle === 'streets' 
        ? 'mapbox://styles/mapbox/outdoors-v12'
        : 'mapbox://styles/mapbox/satellite-streets-v12';
      
      // Store current routes data before style change
      const currentStations = [...nearestStations];
      
      map.current.once('style.load', () => {
        // Re-add routes after style loads
        if (currentStations.length > 0) {
          redrawRoutes(currentStations);
        }
      });
      
      map.current.setStyle(styleUrl);
    }
  }, [mapStyle]);

  // Clear markers and routes
  const clearMapData = () => {
    // Clear old markers
    stationMarkers.current.forEach(marker => marker.remove());
    stationMarkers.current = [];

    // Clear old routes (including shadow and border layers)
    routeLayers.current.forEach(layerId => {
      const layerIds = [layerId, `${layerId}-shadow`, `${layerId}-border`];
      layerIds.forEach(id => {
        if (map.current?.getLayer(id)) {
          map.current.removeLayer(id);
        }
      });
      if (map.current?.getSource(layerId)) {
        map.current.removeSource(layerId);
      }
    });
    routeLayers.current = [];
  };

  // Add markers and routes when stations are loaded
  useEffect(() => {
    if (!map.current || nearestStations.length === 0) return;

    clearMapData();

    // Add station markers and routes
    nearestStations.forEach(async (station, index) => {
      if (!map.current) return;

      // Create custom marker
      const el = document.createElement('div');
      el.style.width = '44px';
      el.style.height = '44px';
      el.style.borderRadius = '50%';
      el.style.border = '3px solid white';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 4px 16px rgba(0,0,0,0.6)';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.backgroundColor = EMERGENCY_COLORS[station.type];
      el.style.color = 'white';
      el.style.fontWeight = 'bold';
      el.style.fontSize = '16px';
      el.innerHTML = `${index + 1}`;

      // Create popup
      const popup = new mapboxgl.Popup({ offset: 25 })
        .setHTML(`
          <div style="padding: 12px; min-width: 220px;">
            <div style="font-weight: 700; font-size: 15px; color: #1a1a1a; margin-bottom: 8px;">
              ${station.name}
            </div>
            <div style="font-size: 13px; color: #444; margin-bottom: 4px;">
              📍 ${station.distance.toFixed(2)} miles away
            </div>
            <div style="font-size: 13px; color: #444; margin-bottom: 6px;">
              🚗 ${station.duration || 'Calculating...'}
            </div>
            <div style="font-size: 11px; color: #666; line-height: 1.4;">
              ${station.address}
            </div>
          </div>
        `);

      // Add marker
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([station.longitude, station.latitude])
        .setPopup(popup)
        .addTo(map.current);

      stationMarkers.current.push(marker);

      // Fetch and draw route
      const routeData = await fetchRoute(station.latitude, station.longitude);
      if (routeData && routeData.geometry && map.current) {
        const layerId = `route-${station.id}`;
        routeLayers.current.push(layerId);

        map.current.addSource(layerId, {
          type: 'geojson',
          data: {
            type: 'Feature',
            geometry: routeData.geometry,
            properties: {}
          }
        });

        // Add shadow layer (outer glow)
        map.current.addLayer({
          id: `${layerId}-shadow`,
          type: 'line',
          source: layerId,
          paint: {
            'line-color': '#000000',
            'line-width': index === 0 ? 16 : 14,
            'line-opacity': 0.25,
            'line-blur': 6
          }
        });

        // Add border layer (white outline)
        map.current.addLayer({
          id: `${layerId}-border`,
          type: 'line',
          source: layerId,
          paint: {
            'line-color': '#ffffff',
            'line-width': index === 0 ? 12 : 10,
            'line-opacity': 1
          }
        });

        // Add main route layer (solid colored line)
        map.current.addLayer({
          id: layerId,
          type: 'line',
          source: layerId,
          paint: {
            'line-color': EMERGENCY_COLORS[station.type],
            'line-width': index === 0 ? 9 : 7,
            'line-opacity': 1
          }
        });
      }
    });

    // Fit map to show all markers
    if (nearestStations.length > 0) {
      const bounds = new mapboxgl.LngLatBounds();
      bounds.extend([callerLongitude, callerLatitude]);
      nearestStations.forEach(station => {
        bounds.extend([station.longitude, station.latitude]);
      });
      map.current.fitBounds(bounds, { padding: 100, duration: 1500 });
    }
  }, [nearestStations]);

  return (
    <div className="relative w-full h-full flex bg-[#1a1a1a]">
      {/* Map - Full Width */}
      <div className="flex-1 relative">
        <div ref={mapContainer} className="w-full h-full" />

        {/* Top Right - Map Controls Only */}
        <div className="absolute top-6 right-6 flex flex-col gap-3">
          {/* Map Style Toggle */}
          <div className="bg-[#1a1a1a]/98 backdrop-blur-xl rounded-xl border border-[#333333] shadow-xl overflow-hidden">
            <button
              onClick={() => setMapStyle('streets')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all w-full ${
                mapStyle === 'streets'
                  ? 'bg-[#5B5FED] hover:bg-[#4a4ec0] text-white'
                  : 'text-gray-300 hover:bg-[#2a2a2a]'
              }`}
            >
              <MapIcon className="w-4 h-4" />
              <span>Map</span>
            </button>
            <button
              onClick={() => setMapStyle('satellite')}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-t border-[#333333] w-full ${
                mapStyle === 'satellite'
                  ? 'bg-[#5B5FED] hover:bg-[#4a4ec0] text-white'
                  : 'text-gray-300 hover:bg-[#2a2a2a]'
              }`}
            >
              <Satellite className="w-4 h-4" />
              <span>Satellite</span>
            </button>
          </div>

          {/* Recenter Button */}
          <button
            onClick={recenterMap}
            className="bg-[#1a1a1a]/98 backdrop-blur-xl rounded-xl border border-[#333333] shadow-xl px-4 py-3 text-gray-300 hover:text-white hover:bg-[#2a2a2a] transition-all flex items-center gap-2"
            title="Recenter on caller"
          >
            <Navigation className="w-4 h-4" />
            <span className="text-sm font-medium">Recenter</span>
          </button>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #1a1a1a;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #404040;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #505050;
        }
      `}</style>
    </div>
  );
});
