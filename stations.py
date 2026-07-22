
# Dummy data for emergency stations
EMERGENCY_STATIONS = {
    "police": [
        {"name": "Central Police Station", "lat": 12.9716, "lon": 77.5946, "address": "Kasturba Road, Bangalore"},
        {"name": "Indiranagar Police Station", "lat": 12.9784, "lon": 77.6408, "address": "Indiranagar, Bangalore"},
        {"name": "Koramangala Police Station", "lat": 12.9352, "lon": 77.6245, "address": "Koramangala, Bangalore"}
    ],
    "fire": [
        {"name": "Central Fire Station", "lat": 12.9719, "lon": 77.5937, "address": "District Office Road, Bangalore"},
        {"name": "Banashankari Fire Station", "lat": 12.9255, "lon": 77.5468, "address": "Banashankari, Bangalore"},
        {"name": "Whitefield Fire Station", "lat": 12.9698, "lon": 77.7500, "address": "Whitefield, Bangalore"}
    ],
    "hospital": [
        {"name": "City Hospital", "lat": 12.9716, "lon": 77.5946, "address": "Vittal Mallya Road, Bangalore"},
        {"name": "Manipal Hospital", "lat": 12.9592, "lon": 77.6482, "address": "Old Airport Road, Bangalore"},
        {"name": "Apollo Hospital", "lat": 12.9344, "lon": 77.6113, "address": "Bannerghatta Road, Bangalore"}
    ]
}

def get_nearest_station(lat, lon, service_type):
    """Find the nearest station for a given service type"""
    import math
    
    stations = EMERGENCY_STATIONS.get(service_type, [])
    if not stations:
        return None
        
    nearest_station = None
    min_distance = float('inf')
    
    for station in stations:
        # Haversine formula for distance
        R = 6371  # Earth radius in km
        dlat = math.radians(station['lat'] - lat)
        dlon = math.radians(station['lon'] - lon)
        a = math.sin(dlat/2) * math.sin(dlat/2) + \
            math.cos(math.radians(lat)) * math.cos(math.radians(station['lat'])) * \
            math.sin(dlon/2) * math.sin(dlon/2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        distance = R * c
        
        if distance < min_distance:
            min_distance = distance
            nearest_station = station
            
    if nearest_station:
        nearest_station['distance_km'] = round(min_distance, 2)
        
    return nearest_station
