import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Plus, Minus, Map as MapIcon, Satellite, MapPin, Search, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';

// Set your Mapbox access token
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// Custom CSS to hide Mapbox logo and attribution
const mapboxStyles = `
  .mapboxgl-ctrl-logo {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
  }
  .mapboxgl-ctrl-attrib,
  .mapboxgl-ctrl-attrib-button {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
  }
  .mapboxgl-ctrl-bottom-left,
  .mapboxgl-ctrl-bottom-right {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
  }
  .mapboxgl-compact {
    display: none !important;
  }
  a[href^="https://www.mapbox.com"] {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
  }
`;

interface MapViewProps {
  latitude?: number;
  longitude?: number;
  zoom?: number;
  onLocationUpdate?: (lat: number, lng: number) => void;
  onServicesUpdate?: (services: EmergencyService[]) => void;
  isFullScreen?: boolean; // Hide controls when in full screen mode
}

interface EmergencyService {
  type: 'hospital' | 'police' | 'fire';
  name: string;
  latitude: number;
  longitude: number;
  distance: number;
}

// Function to calculate distance between two points (Haversine formula)
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

// Function to find nearest emergency services (simulated data - in production, use real API)
const findNearestServices = (lat: number, lng: number): EmergencyService[] => {
  // Simulated emergency services data (in production, fetch from real API like Overpass API or Google Places)
  const services: EmergencyService[] = [
    // Hospitals
    { type: 'hospital', name: 'NewYork-Presbyterian Hospital', latitude: 40.7677, longitude: -73.9537, distance: 0 },
    { type: 'hospital', name: 'Mount Sinai Hospital', latitude: 40.7903, longitude: -73.9524, distance: 0 },
    { type: 'hospital', name: 'Bellevue Hospital', latitude: 40.7391, longitude: -73.9754, distance: 0 },
    
    // Police Stations
    { type: 'police', name: '1st Precinct', latitude: 40.7155, longitude: -74.0027, distance: 0 },
    { type: 'police', name: '5th Precinct', latitude: 40.7142, longitude: -73.9947, distance: 0 },
    { type: 'police', name: '6th Precinct', latitude: 40.7350, longitude: -74.0010, distance: 0 },
    
    // Fire Stations
    { type: 'fire', name: 'Engine 7/Ladder 1', latitude: 40.7185, longitude: -73.9988, distance: 0 },
    { type: 'fire', name: 'Engine 10/Ladder 10', latitude: 40.7114, longitude: -74.0125, distance: 0 },
    { type: 'fire', name: 'Engine 24', latitude: 40.7298, longitude: -73.9969, distance: 0 },
  ];

  // Calculate distances
  services.forEach(service => {
    service.distance = calculateDistance(lat, lng, service.latitude, service.longitude);
  });

  // Get nearest of each type
  const nearest: EmergencyService[] = [];
  ['hospital', 'police', 'fire'].forEach(type => {
    const filtered = services.filter(s => s.type === type);
    if (filtered.length > 0) {
      filtered.sort((a, b) => a.distance - b.distance);
      nearest.push(filtered[0]);
    }
  });

  return nearest;
};

export const MapView = ({ 
  latitude = 40.7128, 
  longitude = -74.0060, 
  zoom = 12,
  onLocationUpdate,
  onServicesUpdate,
  isFullScreen = false
}: MapViewProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const emergencyMarkers = useRef<mapboxgl.Marker[]>([]);
  const cityBoundaryLayer = useRef<string | null>(null);
  const [mapStyle, setMapStyle] = useState<'streets' | 'satellite'>('streets');
  const [currentZoom, setCurrentZoom] = useState(zoom);
  const [emergencyServices, setEmergencyServices] = useState<EmergencyService[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<any[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [hasMarker, setHasMarker] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    // Initialize map with dark theme (Google Maps night mode style)
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/navigation-night-v1', // Dark navigation style similar to Google Maps night mode
      center: [longitude, latitude],
      zoom: zoom,
      attributionControl: false,
    });

    // Add navigation controls (but hide them since we have custom controls)
    const nav = new mapboxgl.NavigationControl({ showCompass: false });
    map.current.addControl(nav, 'top-right');
    // Hide the default navigation control
    const navElement = document.querySelector('.mapboxgl-ctrl-top-right .mapboxgl-ctrl-group');
    if (navElement) {
      (navElement as HTMLElement).style.display = 'none';
    }

    // Don't add marker by default - only when location is searched/selected
    // marker will be created when user searches for a location

    // Update zoom level
    map.current.on('zoom', () => {
      if (map.current) {
        setCurrentZoom(Math.round(map.current.getZoom()));
      }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      if (map.current) {
        map.current.resize();
      }
    });

    if (mapContainer.current) {
      resizeObserver.observe(mapContainer.current);
    }

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Update marker position and emergency services when location changes
  useEffect(() => {
    if (marker.current && map.current) {
      marker.current.setLngLat([longitude, latitude]);
      map.current.flyTo({
        center: [longitude, latitude],
        zoom: zoom,
        duration: 1000
      });

      // Find and display nearest emergency services
      const nearest = findNearestServices(latitude, longitude);
      setEmergencyServices(nearest);
      
      // Notify parent component
      if (onServicesUpdate) {
        onServicesUpdate(nearest);
      }

      // Remove old emergency markers
      emergencyMarkers.current.forEach(m => m.remove());
      emergencyMarkers.current = [];

      // Add new emergency markers
      nearest.forEach(service => {
        // Create custom marker element
        const el = document.createElement('div');
        el.className = 'emergency-marker';
        el.style.width = '36px';
        el.style.height = '36px';
        el.style.borderRadius = '50%';
        el.style.border = '3px solid white';
        el.style.cursor = 'pointer';
        el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
        el.style.display = 'flex';
        el.style.alignItems = 'center';
        el.style.justifyContent = 'center';
        el.style.transition = 'all 0.2s ease';
        el.style.position = 'relative';
        
        // Add hover effect with box-shadow instead of scale to prevent position shift
        el.onmouseenter = () => { 
          el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.7)';
          el.style.borderWidth = '4px';
        };
        el.onmouseleave = () => { 
          el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
          el.style.borderWidth = '3px';
        };
        
        // Set color and icon based on type
        if (service.type === 'hospital') {
          el.style.backgroundColor = '#3b82f6'; // Blue
          el.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v20M2 12h20"/>
              <rect x="6" y="6" width="12" height="12" rx="2"/>
            </svg>
          `;
        } else if (service.type === 'police') {
          el.style.backgroundColor = '#22c55e'; // Green
          el.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5">
              <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"/>
              <path d="M12 8v4M12 16h.01" stroke="white" stroke-width="2" stroke-linecap="round"/>
            </svg>
          `;
        } else if (service.type === 'fire') {
          el.style.backgroundColor = '#ef4444'; // Red
          el.innerHTML = `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5">
              <path d="M12 2c-1.5 4-4 6-4 11a4 4 0 0 0 8 0c0-5-2.5-7-4-11z"/>
              <path d="M12 13c-1 2-2 3-2 5a2 2 0 0 0 4 0c0-2-1-3-2-5z" fill="#ef4444"/>
            </svg>
          `;
        }

        // Create popup
        const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
          .setHTML(`
            <div style="padding: 8px; min-width: 150px;">
              <div style="font-weight: 600; font-size: 13px; color: #1a1a1a; margin-bottom: 4px;">
                ${service.name}
              </div>
              <div style="font-size: 11px; color: #666;">
                ${service.distance.toFixed(2)} miles away
              </div>
            </div>
          `);

        // Create and add marker with centered anchor
        const emergencyMarker = new mapboxgl.Marker({ 
          element: el,
          anchor: 'center' // Center the marker on the coordinates
        })
          .setLngLat([service.longitude, service.latitude])
          .setPopup(popup)
          .addTo(map.current!);

        emergencyMarkers.current.push(emergencyMarker);
      });
    }
  }, [latitude, longitude, zoom]);

  // Update map style when toggle changes
  useEffect(() => {
    if (map.current) {
      const styleUrl = mapStyle === 'streets' 
        ? 'mapbox://styles/mapbox/navigation-night-v1' // Dark navigation style
        : 'mapbox://styles/mapbox/satellite-streets-v12'; // Satellite view
      
      map.current.setStyle(styleUrl);
    }
  }, [mapStyle]);

  const handleZoomIn = () => {
    if (map.current) {
      map.current.zoomIn();
    }
  };

  const handleZoomOut = () => {
    if (map.current) {
      map.current.zoomOut();
    }
  };

  // Search for location using Mapbox Geocoding API
  const handleSearch = async (query: string) => {
    setSearchQuery(query);
    
    if (query.length < 3) {
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!mapboxToken || mapboxToken === 'your_mapbox_token_here') {
      console.error('Mapbox token not configured');
      return;
    }

    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxToken}&limit=5&types=place,address,poi`
      );
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        setSearchSuggestions(data.features);
        setShowSuggestions(true);
      } else {
        setSearchSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchSuggestions([]);
      setShowSuggestions(false);
    }
  };

  // Select a location from suggestions
  const selectLocation = async (feature: any) => {
    const [lng, lat] = feature.center;
    const isCity = feature.place_type && (feature.place_type.includes('place') || feature.place_type.includes('region'));
    
    // Remove old city boundary if exists
    if (map.current && cityBoundaryLayer.current) {
      if (map.current.getLayer(cityBoundaryLayer.current)) {
        map.current.removeLayer(cityBoundaryLayer.current);
      }
      if (map.current.getSource(cityBoundaryLayer.current)) {
        map.current.removeSource(cityBoundaryLayer.current);
      }
      cityBoundaryLayer.current = null;
    }

    // If it's a city/place, show actual boundary instead of marker
    if (isCity) {
      // Remove marker if exists
      if (marker.current) {
        marker.current.remove();
        marker.current = null;
        setHasMarker(false);
      }

      const boundaryId = `city-boundary-${Date.now()}`;
      cityBoundaryLayer.current = boundaryId;

      // Fetch actual city boundary using Nominatim API (OpenStreetMap data)
      const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN;
      
      if (map.current) {
        // Get OSM ID from the feature if available, or search by name
        const searchQuery = feature.place_name || feature.text;
        
        // Use Nominatim to get polygon data
        console.log('Fetching boundary for:', searchQuery);
        fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&polygon_geojson=1&limit=1`, {
          headers: {
            'User-Agent': 'EmergencyDispatchApp/1.0'
          }
        })
          .then(res => res.json())
          .then(data => {
            console.log('Nominatim response:', data);
            if (data && data.length > 0 && map.current) {
              const osmData = data[0];
              let boundaryFeature: any = null;
              
              // Check if we have polygon data
              if (osmData.geojson && (osmData.geojson.type === 'Polygon' || osmData.geojson.type === 'MultiPolygon')) {
                console.log('Found polygon boundary:', osmData.geojson.type);
                boundaryFeature = {
                  type: 'Feature' as const,
                  geometry: osmData.geojson,
                  properties: {}
                };
              } else {
                console.log('No polygon geometry in response, geojson:', osmData.geojson);
              }
              
              if (boundaryFeature && map.current) {
                map.current.once('idle', () => {
                  if (!map.current) return;

                  // Add boundary source with actual geometry
                  map.current.addSource(boundaryId, {
                    type: 'geojson',
                    data: boundaryFeature
                  });

                  // Add white base layer for the dashed pattern
                  map.current.addLayer({
                    id: `${boundaryId}-white`,
                    type: 'line',
                    source: boundaryId,
                    paint: {
                      'line-color': '#ffffff',
                      'line-width': 5,
                      'line-opacity': 1
                    }
                  });

                  // Add red dashed layer on top to create red-white pattern
                  map.current.addLayer({
                    id: boundaryId,
                    type: 'line',
                    source: boundaryId,
                    paint: {
                      'line-color': '#ef4444', // Red color
                      'line-width': 5,
                      'line-opacity': 1,
                      'line-dasharray': [3, 3] // Dashed pattern - creates alternating red-white
                    }
                  });

                  // Add fill layer (semi-transparent)
                  map.current.addLayer({
                    id: `${boundaryId}-fill`,
                    type: 'fill',
                    source: boundaryId,
                    paint: {
                      'fill-color': '#ef4444',
                      'fill-opacity': 0.08
                    }
                  });
                });
                
                // Fit map to boundary using the bounding box from Nominatim
                if (osmData.boundingbox) {
                  const [minLat, maxLat, minLng, maxLng] = osmData.boundingbox.map(Number);
                  map.current.fitBounds([
                    [minLng, minLat],
                    [maxLng, maxLat]
                  ], {
                    padding: 50,
                    duration: 1500
                  });
                }
              } else {
                // Fallback to bbox if no polygon geometry
                throw new Error('No boundary geometry found');
              }
            } else if (feature.bbox && map.current) {
              // Fallback to bbox if boundary not available
              const [minLng, minLat, maxLng, maxLat] = feature.bbox;
              
              map.current.once('idle', () => {
                if (!map.current) return;

                map.current.addSource(boundaryId, {
                  type: 'geojson',
                  data: {
                    type: 'Feature',
                    geometry: {
                      type: 'Polygon',
                      coordinates: [[
                        [minLng, minLat],
                        [maxLng, minLat],
                        [maxLng, maxLat],
                        [minLng, maxLat],
                        [minLng, minLat]
                      ]]
                    },
                    properties: {}
                  }
                });

                // Add white base layer
                map.current.addLayer({
                  id: `${boundaryId}-white`,
                  type: 'line',
                  source: boundaryId,
                  paint: {
                    'line-color': '#ffffff',
                    'line-width': 5,
                    'line-opacity': 1
                  }
                });

                // Add red dashed layer on top
                map.current.addLayer({
                  id: boundaryId,
                  type: 'line',
                  source: boundaryId,
                  paint: {
                    'line-color': '#ef4444',
                    'line-width': 5,
                    'line-opacity': 1,
                    'line-dasharray': [3, 3]
                  }
                });

                map.current.addLayer({
                  id: `${boundaryId}-fill`,
                  type: 'fill',
                  source: boundaryId,
                  paint: {
                    'fill-color': '#ef4444',
                    'fill-opacity': 0.08
                  }
                });
              });
            }
          })
          .catch(err => {
            console.error('Error fetching boundary from Nominatim:', err);
            // Fallback to bbox
            if (feature.bbox && map.current) {
              const [minLng, minLat, maxLng, maxLat] = feature.bbox;
              
              map.current.once('idle', () => {
                if (!map.current) return;

                map.current.addSource(boundaryId, {
                  type: 'geojson',
                  data: {
                    type: 'Feature',
                    geometry: {
                      type: 'Polygon',
                      coordinates: [[
                        [minLng, minLat],
                        [maxLng, minLat],
                        [maxLng, maxLat],
                        [minLng, maxLat],
                        [minLng, minLat]
                      ]]
                    },
                    properties: {}
                  }
                });

                // Add white base layer
                map.current.addLayer({
                  id: `${boundaryId}-white`,
                  type: 'line',
                  source: boundaryId,
                  paint: {
                    'line-color': '#ffffff',
                    'line-width': 5,
                    'line-opacity': 1
                  }
                });

                // Add red dashed layer on top
                map.current.addLayer({
                  id: boundaryId,
                  type: 'line',
                  source: boundaryId,
                  paint: {
                    'line-color': '#ef4444',
                    'line-width': 5,
                    'line-opacity': 1,
                    'line-dasharray': [3, 3]
                  }
                });

                map.current.addLayer({
                  id: `${boundaryId}-fill`,
                  type: 'fill',
                  source: boundaryId,
                  paint: {
                    'fill-color': '#ef4444',
                    'fill-opacity': 0.08
                  }
                });
              });
            }
          });

        // Fit map to boundary
        if (feature.bbox) {
          const [minLng, minLat, maxLng, maxLat] = feature.bbox;
          map.current.fitBounds([
            [minLng, minLat],
            [maxLng, maxLat]
          ], {
            padding: 50,
            duration: 1500
          });
        } else {
          map.current.flyTo({
            center: [lng, lat],
            zoom: 11,
            duration: 1500
          });
        }
      }
    } else {
      // For specific addresses/POIs, show marker
      if (!marker.current && map.current) {
        marker.current = new mapboxgl.Marker({
          color: '#3b82f6',
          draggable: true
        })
          .setLngLat([lng, lat])
          .addTo(map.current);

        // Update location on marker drag
        marker.current.on('dragend', () => {
          if (marker.current && onLocationUpdate) {
            const lngLat = marker.current.getLngLat();
            onLocationUpdate(lngLat.lat, lngLat.lng);
          }
        });
      } else if (marker.current) {
        marker.current.setLngLat([lng, lat]);
      }

      // Fly to location
      if (map.current) {
        map.current.flyTo({
          center: [lng, lat],
          zoom: 14,
          duration: 1500
        });
      }
      
      setHasMarker(true);
    }

    // Update parent component
    if (onLocationUpdate) {
      onLocationUpdate(lat, lng);
    }

    // Find nearest emergency services
    const nearest = findNearestServices(lat, lng);
    setEmergencyServices(nearest);
    if (onServicesUpdate) {
      onServicesUpdate(nearest);
    }

    // Remove old emergency markers
    emergencyMarkers.current.forEach(m => m.remove());
    emergencyMarkers.current = [];

    // Add new emergency markers (reuse existing logic)
    nearest.forEach(service => {
      const el = document.createElement('div');
      el.className = 'emergency-marker';
      el.style.width = '36px';
      el.style.height = '36px';
      el.style.borderRadius = '50%';
      el.style.border = '3px solid white';
      el.style.cursor = 'pointer';
      el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.transition = 'all 0.2s ease';
      el.style.position = 'relative';
      
      el.onmouseenter = () => { 
        el.style.boxShadow = '0 6px 20px rgba(0,0,0,0.7)';
        el.style.borderWidth = '4px';
      };
      el.onmouseleave = () => { 
        el.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
        el.style.borderWidth = '3px';
      };
      
      if (service.type === 'hospital') {
        el.style.backgroundColor = '#3b82f6';
        el.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20"/><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
      } else if (service.type === 'police') {
        el.style.backgroundColor = '#22c55e';
        el.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5"><path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"/><path d="M12 8v4M12 16h.01" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`;
      } else if (service.type === 'fire') {
        el.style.backgroundColor = '#ef4444';
        el.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1.5"><path d="M12 2c-1.5 4-4 6-4 11a4 4 0 0 0 8 0c0-5-2.5-7-4-11z"/><path d="M12 13c-1 2-2 3-2 5a2 2 0 0 0 4 0c0-2-1-3-2-5z" fill="#ef4444"/></svg>`;
      }

      const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
        .setHTML(`<div style="padding: 8px; min-width: 150px;"><div style="font-weight: 600; font-size: 13px; color: #1a1a1a; margin-bottom: 4px;">${service.name}</div><div style="font-size: 11px; color: #666;">${service.distance.toFixed(2)} miles away</div></div>`);

      const emergencyMarker = new mapboxgl.Marker({ element: el, anchor: 'center' })
        .setLngLat([service.longitude, service.latitude])
        .setPopup(popup)
        .addTo(map.current!);

      emergencyMarkers.current.push(emergencyMarker);
    });

    setHasMarker(true);
    setSearchQuery(feature.place_name);
    setShowSuggestions(false);
  };

  // Clear search and marker
  const clearSearch = () => {
    setSearchQuery('');
    setSearchSuggestions([]);
    setShowSuggestions(false);
    
    if (marker.current) {
      marker.current.remove();
      marker.current = null;
      setHasMarker(false);
    }

    // Remove city boundary if exists
    if (map.current && cityBoundaryLayer.current) {
      if (map.current.getLayer(cityBoundaryLayer.current)) {
        map.current.removeLayer(cityBoundaryLayer.current);
      }
      if (map.current.getLayer(`${cityBoundaryLayer.current}-fill`)) {
        map.current.removeLayer(`${cityBoundaryLayer.current}-fill`);
      }
      if (map.current.getSource(cityBoundaryLayer.current)) {
        map.current.removeSource(cityBoundaryLayer.current);
      }
      cityBoundaryLayer.current = null;
    }

    // Remove emergency markers
    emergencyMarkers.current.forEach(m => m.remove());
    emergencyMarkers.current = [];
  };

  return (
    <div className="relative w-full h-full">
      {/* Inject custom styles to hide Mapbox logo */}
      <style>{mapboxStyles}</style>
      
      {/* Map Container */}
      <div ref={mapContainer} className="w-full h-full rounded-lg overflow-hidden" />

      {/* Search Box - Only show in full screen mode */}
      {isFullScreen && (
        <div className="absolute top-4 left-4 w-96 z-10">
          <div className="relative">
            <div className="flex items-center gap-2 bg-[#1a1a1a]/95 backdrop-blur-md rounded-xl border border-[#333333] shadow-xl px-4 py-3">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search location (e.g., Times Square, NYC)"
                className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 outline-none"
              />
              {searchQuery && (
                <button onClick={clearSearch} className="text-gray-400 hover:text-white transition-colors">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Search Suggestions */}
            {showSuggestions && searchSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a]/98 backdrop-blur-md rounded-xl border border-[#333333] shadow-2xl overflow-hidden max-h-64 overflow-y-auto custom-scrollbar">
                {searchSuggestions.map((suggestion, idx) => (
                  <button
                    key={idx}
                    onClick={() => selectLocation(suggestion)}
                    className="w-full text-left px-4 py-3 hover:bg-[#2a2a2a] transition-colors border-b border-[#333333] last:border-b-0"
                  >
                    <div className="flex items-start gap-3">
                      <MapPin className="w-4 h-4 text-[#fb923c] mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white font-medium truncate">
                          {suggestion.text}
                        </div>
                        <div className="text-xs text-gray-400 truncate">
                          {suggestion.place_name}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Map Controls Overlay - Always show */}
      {(
        <div className="absolute top-3 right-3 flex flex-col gap-2">
          {/* Style Toggle - Map/Satellite */}
          <div className="bg-[#1a1a1a]/95 backdrop-blur-md rounded-xl border border-[#333333] shadow-xl overflow-hidden min-w-[100px]">
            <button
              onClick={() => setMapStyle('streets')}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-medium transition-all duration-200 w-full ${
                mapStyle === 'streets' 
                  ? 'bg-gradient-to-r from-[#fb923c] to-[#ea7b1a] text-white shadow-lg' 
                  : 'text-gray-300 hover:text-white hover:bg-[#2a2a2a]'
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
              <span>Map</span>
            </button>
            <button
              onClick={() => setMapStyle('satellite')}
              className={`flex items-center gap-2 px-3 py-2 text-xs font-medium transition-all duration-200 border-t border-[#333333] w-full ${
                mapStyle === 'satellite' 
                  ? 'bg-gradient-to-r from-[#fb923c] to-[#ea7b1a] text-white shadow-lg' 
                  : 'text-gray-300 hover:text-white hover:bg-[#2a2a2a]'
              }`}
            >
              <Satellite className="w-3.5 h-3.5" />
              <span>Satellite</span>
            </button>
          </div>

          {/* Zoom Controls - Curved Square Box */}
          <div className="bg-[#1a1a1a]/95 backdrop-blur-md rounded-xl border border-[#333333] shadow-xl overflow-hidden">
            <button
              onClick={handleZoomIn}
              className="flex items-center justify-center w-11 h-11 text-gray-300 hover:text-white hover:bg-gradient-to-r hover:from-[#fb923c] hover:to-[#ea7b1a] transition-all duration-200"
              title="Zoom in"
            >
              <Plus className="w-5 h-5" />
            </button>
            <div className="border-t border-[#333333] px-3 py-1.5 text-center bg-[#0a0a0a]/50">
              <span className="text-sm font-semibold text-gray-300">{currentZoom}</span>
            </div>
            <button
              onClick={handleZoomOut}
              className="flex items-center justify-center w-11 h-11 text-gray-300 hover:text-white hover:bg-gradient-to-r hover:from-[#fb923c] hover:to-[#ea7b1a] transition-all duration-200 border-t border-[#333333]"
              title="Zoom out"
            >
              <Minus className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Coordinates Indicator - Only show when marker is placed */}
      {hasMarker && marker.current && (
        <div className="absolute bottom-4 left-4 bg-[#1a1a1a]/95 backdrop-blur-md rounded-xl border border-[#333333] shadow-xl px-3 py-2">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3 h-3 text-[#fb923c]" />
            <span className="text-xs font-medium text-gray-300">
              {latitude.toFixed(4)}°N, {Math.abs(longitude).toFixed(4)}°{longitude < 0 ? 'W' : 'E'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
