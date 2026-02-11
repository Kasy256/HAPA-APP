import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, ViewStyle } from 'react-native';

type SkeletonBoxProps = {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * YouTube-style skeleton block (subtle shimmer/pulse).
 * No external libs needed.
 */
export function SkeletonBox({
  width = '100%',
  height = 12,
  borderRadius = 8,
  style,
}: SkeletonBoxProps) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.75,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  const baseStyle = useMemo(
    () => [{ width, height, borderRadius }, styles.base, style] as const,
    [width, height, borderRadius, style],
  );

  return <Animated.View style={[baseStyle, { opacity }]} />;
}

export function SkeletonCircle({ size = 56, style }: { size?: number; style?: StyleProp<ViewStyle> }) {
  return <SkeletonBox width={size} height={size} borderRadius={size / 2} style={style} />;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
});

