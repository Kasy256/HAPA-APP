import { Linking, Platform, Alert } from 'react-native';

/**
 * Opens the device's native map application with directions to the specified coordinates.
 * 
 * @param latitude - Destination latitude
 * @param longitude - Destination longitude
 * @param label - Optional title for the location (useful for Apple Maps)
 */
export const openDirections = async (latitude: number, longitude: number, label?: string) => {
    if (!latitude || !longitude) {
        Alert.alert('Error', 'Location coordinates are unavailable for this venue.');
        return;
    }

    const scheme = Platform.select({
        ios: 'maps://0,0?q=',
        android: 'geo:0,0?q=',
    });

    const latLng = `${latitude},${longitude}`;
    const encodedLabel = encodeURIComponent(label || 'Venue');

    // Platform specific deep links
    // Android: https://www.google.com/maps/dir/?api=1&destination=LAT,LNG
    // iOS: http://maps.apple.com/?daddr=LAT,LNG

    const url = Platform.select({
        ios: `http://maps.apple.com/?daddr=${latLng}&q=${encodedLabel}`,
        android: `https://www.google.com/maps/dir/?api=1&destination=${latLng}`,
    });

    if (!url) return;

    try {
        const supported = await Linking.canOpenURL(url);

        if (supported) {
            await Linking.openURL(url);
        } else {
            // Fallback to browser if the app isn't found or scheme isn't supported
            const browserUrl = `https://www.google.com/maps/dir/?api=1&destination=${latLng}`;
            await Linking.openURL(browserUrl);
        }
    } catch (error) {
        console.error('Error opening maps:', error);
        Alert.alert('Error', 'Could not open map application.');
    }
};
