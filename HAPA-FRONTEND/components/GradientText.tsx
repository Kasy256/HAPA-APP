
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Text, TextStyle } from 'react-native';

interface GradientTextProps {
    colors: string[];
    style?: TextStyle;
    children: React.ReactNode;
}

export function GradientText({ colors, style, children }: GradientTextProps) {
    return (
        <MaskedView maskElement={<Text style={style}>{children}</Text>}>
            <LinearGradient
                colors={colors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
            >
                <Text style={[style, { opacity: 0 }]}>{children}</Text>
            </LinearGradient>
        </MaskedView>
    );
}
