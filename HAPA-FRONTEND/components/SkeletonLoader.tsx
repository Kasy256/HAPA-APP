import React, { useEffect } from 'react';
import { View, StyleSheet, Animated, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenWrapper } from './ScreenWrapper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

const SkeletonPulse = ({ style }: { style: any }) => {
    const opacity = new Animated.Value(0.3);

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(opacity, {
                    toValue: 0.7,
                    duration: 800,
                    useNativeDriver: true,
                }),
                Animated.timing(opacity, {
                    toValue: 0.3,
                    duration: 800,
                    useNativeDriver: true,
                }),
            ])
        ).start();
    }, []);

    return <Animated.View style={[style, { opacity, backgroundColor: '#2C2C2E' }]} />;
};

export const DiscoverSkeleton = () => {
    return (
        <View style={styles.discoverContainer}>
            {/* Background Placeholder */}
            <SkeletonPulse style={StyleSheet.absoluteFill} />
            
            {/* Overlay Elements */}
            <View style={styles.discoverOverlay}>
                <View style={styles.bottomLeft}>
                    <SkeletonPulse style={styles.venueBadge} />
                    <SkeletonPulse style={styles.captionLine} />
                    <SkeletonPulse style={[styles.captionLine, { width: '60%' }]} />
                </View>
                
                <View style={styles.bottomRight}>
                    <SkeletonPulse style={styles.circleBtn} />
                    <SkeletonPulse style={styles.circleBtn} />
                    <SkeletonPulse style={styles.circleBtn} />
                    <SkeletonPulse style={styles.directionsBtn} />
                </View>
            </View>
        </View>
    );
};

export const SearchSkeleton = () => {
    const insets = useSafeAreaInsets();
    return (
        <ScreenWrapper style={styles.searchContainer}>
            {/* Search Bar */}
            <SkeletonPulse style={[styles.searchBar, { marginTop: insets.top + 10 }]} />
            
            {/* Stories Ring */}
            <View style={styles.storiesRow}>
                {[1, 2, 3, 4, 5].map(i => (
                    <SkeletonPulse key={i} style={styles.storyCircle} />
                ))}
            </View>
            
            {/* Grid */}
            <View style={styles.grid}>
                {[1, 2, 4, 5, 6, 7, 8, 9].map(i => (
                    <SkeletonPulse key={i} style={styles.gridItem} />
                ))}
            </View>
        </ScreenWrapper>
    );
};

const styles = StyleSheet.create({
    discoverContainer: {
        width,
        height,
        backgroundColor: 'black',
    },
    discoverOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        paddingHorizontal: 20,
        paddingBottom: 120,
        flexDirection: 'row',
        alignItems: 'flex-end',
    },
    bottomLeft: {
        flex: 1,
    },
    venueBadge: {
        width: 150,
        height: 40,
        borderRadius: 20,
        marginBottom: 15,
    },
    captionLine: {
        width: '80%',
        height: 12,
        borderRadius: 6,
        marginBottom: 8,
    },
    bottomRight: {
        alignItems: 'center',
        gap: 20,
        marginLeft: 20,
    },
    circleBtn: {
        width: 45,
        height: 45,
        borderRadius: 22.5,
    },
    directionsBtn: {
        width: 50,
        height: 50,
        borderRadius: 25,
    },
    searchContainer: {
        flex: 1,
        padding: 20,
    },
    searchBar: {
        width: '100%',
        height: 50,
        borderRadius: 12,
        marginBottom: 30,
        marginTop: 40,
    },
    storiesRow: {
        flexDirection: 'row',
        gap: 15,
        marginBottom: 40,
    },
    storyCircle: {
        width: 70,
        height: 70,
        borderRadius: 35,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 15,
    },
    gridItem: {
        width: (width - 55) / 2,
        height: 110,
        borderRadius: 15,
    }
});
