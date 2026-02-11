
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function CreatePostScreen() {
    const router = useRouter();

    return (
        <ScreenWrapper style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>New Post</Text>
                <TouchableOpacity onPress={() => router.back()}>
                    <Ionicons name="close" size={28} color={Colors.text.primary} />
                </TouchableOpacity>
            </View>

            <View style={styles.placeholderContainer}>
                <View style={styles.previewPlaceholder}>
                    <Ionicons name="image-outline" size={64} color={Colors.text.secondary} />
                    <Text style={styles.previewText}>Select Photo or Video</Text>
                </View>

                <TouchableOpacity style={styles.selectButton}>
                    <Text style={styles.selectButtonText}>Open Gallery</Text>
                </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.postButton}>
                <Text style={styles.postButtonText}>Share Vibe</Text>
            </TouchableOpacity>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    container: {
        padding: 24,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 32,
        marginTop: 20,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: Colors.text.primary,
    },
    placeholderContainer: {
        flex: 1,
        gap: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    previewPlaceholder: {
        width: '100%',
        aspectRatio: 9 / 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
        borderStyle: 'dashed',
    },
    previewText: {
        color: Colors.text.secondary,
        marginTop: 16,
    },
    selectButton: {
        padding: 16,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 50,
    },
    selectButtonText: {
        color: Colors.text.primary,
    },
    postButton: {
        backgroundColor: Colors.cta.primary,
        padding: 18,
        borderRadius: 12,
        alignItems: 'center',
        marginTop: 'auto',
    },
    postButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
});
