import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { TimePickerField } from '@/components/TimePickerField';
import { apiFetch, getAccessToken } from '@/lib/api';
import { uploadImage } from '@/lib/supabaseClient';
import HapaLogo from '../assets/images/hapalogo.png';



export default function VenueOnboardingScreen() {
    const router = useRouter();
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        name: '',
        types: [] as string[],
        city: '',
        area: '',
        images: [] as string[],
        working_hours: {
            monday: { open: '09:00', close: '22:00' },
            tuesday: { open: '09:00', close: '22:00' },
            wednesday: { open: '09:00', close: '22:00' },
            thursday: { open: '09:00', close: '22:00' },
            friday: { open: '09:00', close: '22:00' },
            saturday: { open: '09:00', close: '22:00' },
            sunday: { open: '09:00', close: '22:00' },
        } as Record<string, { open: string; close: string } | null>,
    });

    const totalSteps = 4;

    const [citySuggestions, setCitySuggestions] = useState<any[]>([]);
    const [areaSuggestions, setAreaSuggestions] = useState<any[]>([]);

    const [submitting, setSubmitting] = useState(false);

    // Guard: ensure user is logged in (has JWT) before allowing onboarding
    useEffect(() => {
        (async () => {
            const token = await getAccessToken();
            if (!token) {
                Alert.alert(
                    'Login required',
                    'Please log in as a venue owner before creating a venue profile.',
                    [
                        {
                            text: 'OK',
                            onPress: () => router.replace('/venue-login'),
                        },
                    ],
                );
            }
        })();
    }, [router]);

    const validateStep = () => {
        if (step === 1) {
            if (!formData.name.trim() || formData.types.length === 0) {
                Alert.alert('Missing info', 'Please add a venue name and select at least one venue type.');
                return false;
            }
        } else if (step === 2) {
            if (!formData.city.trim() || !formData.area.trim()) {
                Alert.alert('Missing info', 'Please fill in both city and area.');
                return false;
            }
        } else if (step === 3) {
            if (formData.images.length === 0) {
                Alert.alert('Missing info', 'Please add at least one image.');
                return false;
            }
        }
        return true;
    };

    const nextStep = async () => {
        if (step < totalSteps) {
            if (!validateStep()) return;
            setStep(step + 1);
            return;
        }

        if (submitting) return;

        if (!validateStep()) return;

        try {
            setSubmitting(true);

            const primaryType = formData.types[0] || '';
            if (!formData.name.trim() || !primaryType || !formData.city.trim() || !formData.area.trim()) {
                Alert.alert('Missing info', 'Please complete all fields before submitting.');
                setSubmitting(false);
                return;
            }

            await apiFetch('/api/venues', {
                method: 'POST',
                auth: true,
                body: JSON.stringify({
                    name: formData.name,
                    type: primaryType,
                    categories: formData.types,
                    city: formData.city,
                    area: formData.area,
                    images: formData.images,
                    working_hours: formData.working_hours,
                }),
            });

            Alert.alert('Success', 'Venue profile created successfully.', [
                { text: 'OK', onPress: () => router.replace('/(venue)') },
            ]);
        } catch (error: any) {
            Alert.alert('Error', error.message || 'Failed to create venue profile');
        } finally {
            setSubmitting(false);
        }
    };

    const prevStep = () => {
        if (step > 1) setStep(step - 1);
        else router.back();
    };

    const fetchLocationSuggestions = async (text: string, field: 'city' | 'area') => {
        const trimmed = text.trim();
        if (trimmed.length < 3) {
            if (field === 'city') setCitySuggestions([]);
            if (field === 'area') setAreaSuggestions([]);
            return;
        }
        try {
            const res = await apiFetch(`/api/locations/suggest?q=${encodeURIComponent(trimmed)}`);
            const suggestions = res.suggestions || [];
            if (field === 'city') {
                setCitySuggestions(suggestions);
            } else {
                setAreaSuggestions(suggestions);
            }
        } catch {
            if (field === 'city') setCitySuggestions([]);
            if (field === 'area') setAreaSuggestions([]);
        }
    };

    const pickImages = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            allowsMultipleSelection: true,
            selectionLimit: 5,
            quality: 0.8,
        });

        if (result.canceled || !result.assets || result.assets.length === 0) return;

        try {
            setSubmitting(true);

            const uploadedUrls: string[] = [];
            for (const asset of result.assets) {
                const url = await uploadImage(asset.uri, { bucket: 'media', folder: 'venues' });
                uploadedUrls.push(url);
            }

            setFormData(prev => ({
                ...prev,
                images: [...prev.images, ...uploadedUrls],
            }));
        } catch (e: any) {
            Alert.alert('Upload failed', e.message || 'Could not upload images. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const removeImage = (index: number) => {
        const updatedImages = formData.images.filter((_, i) => i !== index);
        setFormData({ ...formData, images: updatedImages });
    };

    const ProgressBar = () => {
        const progress = (step / totalSteps) * 100;
        return (
            <View style={styles.progressContainer}>
                <View style={[styles.progressBar, { width: `${progress}%` }]} />
            </View>
        );
    };

    return (
        <ScreenWrapper style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
            >
                <View style={styles.header}>
                    <TouchableOpacity onPress={prevStep} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="white" />
                    </TouchableOpacity>
                    <ProgressBar />
                    <Text style={styles.stepText}>{step}/{totalSteps}</Text>
                </View>

                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    <View style={styles.brandHeader}>
                        <Image source={HapaLogo} style={styles.brandLogo} resizeMode="contain" />
                        <Text style={styles.brandText}>HAPA</Text>
                    </View>

                    {step === 1 && (
                        <View style={styles.stepContainer}>
                            <Text style={styles.heading}>Let's get started</Text>
                            <Text style={styles.subHeading}>What's the name & vibe of your venue?</Text>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Venue Name</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="e.g. The Alchemist"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    value={formData.name}
                                    onChangeText={(t) => setFormData({ ...formData, name: t })}
                                    autoFocus
                                />
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Venue Type (select all that apply)</Text>
                                <View style={styles.chipHelpers}>
                                    {['Bar', 'Lounge', 'Club', 'Restaurant', 'Cafe', 'Rooftop'].map(type => {
                                        const isActive = formData.types.includes(type);
                                        return (
                                            <TouchableOpacity
                                                key={type}
                                                style={[styles.chip, isActive && styles.activeChip]}
                                                onPress={() => {
                                                    setFormData(prev => {
                                                        const already = prev.types.includes(type);
                                                        return {
                                                            ...prev,
                                                            types: already
                                                                ? prev.types.filter(t => t !== type)
                                                                : [...prev.types, type],
                                                        };
                                                    });
                                                }}
                                                activeOpacity={0.8}
                                            >
                                                <Text style={[styles.chipText, isActive && styles.activeChipText]}>{type}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        </View>
                    )}

                    {step === 2 && (
                        <View style={styles.stepContainer}>
                            <Text style={styles.heading}>Location details</Text>
                            <Text style={styles.subHeading}>Help people find you easily.</Text>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>City</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="e.g. City"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    value={formData.city}
                                    onChangeText={(t) => {
                                        setFormData({ ...formData, city: t });
                                        fetchLocationSuggestions(t, 'city');
                                    }}
                                    autoFocus
                                />
                                {citySuggestions.length > 0 && (
                                    <View style={styles.suggestionList}>
                                        {citySuggestions.map((s: any) => (
                                            <TouchableOpacity
                                                key={s.id}
                                                style={styles.suggestionItem}
                                                onPress={() => {
                                                    setFormData({ ...formData, city: s.name });
                                                    setCitySuggestions([]);
                                                }}
                                            >
                                                <Text style={styles.suggestionText}>{s.name}</Text>
                                                {!!s.address && (
                                                    <Text style={styles.suggestionSubText} numberOfLines={1}>
                                                        {s.address}
                                                    </Text>
                                                )}
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>Area / Neighborhood</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="e.g. Neighborhood"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    value={formData.area}
                                    onChangeText={(t) => {
                                        setFormData({ ...formData, area: t });
                                        fetchLocationSuggestions(t, 'area');
                                    }}
                                />
                                {areaSuggestions.length > 0 && (
                                    <View style={styles.suggestionList}>
                                        {areaSuggestions.map((s: any) => (
                                            <TouchableOpacity
                                                key={s.id}
                                                style={styles.suggestionItem}
                                                onPress={() => {
                                                    setFormData({
                                                        ...formData,
                                                        area: s.name,
                                                        city: formData.city || s.address,
                                                    });
                                                    setAreaSuggestions([]);
                                                }}
                                            >
                                                <Text style={styles.suggestionText}>{s.name}</Text>
                                                {!!s.address && (
                                                    <Text style={styles.suggestionSubText} numberOfLines={1}>
                                                        {s.address}
                                                    </Text>
                                                )}
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                            </View>
                        </View>
                    )}

                    {step === 3 && (
                        <View style={styles.stepContainer}>
                            <Text style={styles.heading}>Set the scene</Text>
                            <Text style={styles.subHeading}>Upload your stunning views.</Text>

                            <ScrollView
                                horizontal
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.slideshowScroll}
                            >
                                <TouchableOpacity
                                    style={styles.addImageButton}
                                    onPress={pickImages}
                                >
                                    <Ionicons name="add" size={32} color="rgba(255,255,255,0.5)" />
                                    <Text style={styles.addImageText}>Add</Text>
                                </TouchableOpacity>

                                {formData.images.map((uri, index) => (
                                    <View key={index} style={styles.slideshowItem}>
                                        <Image source={{ uri }} style={styles.slideshowImage} />
                                        <TouchableOpacity
                                            style={styles.removeImageButton}
                                            onPress={() => removeImage(index)}
                                        >
                                            <Ionicons name="close-circle" size={24} color={Colors.cta.primary} />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                    {step === 4 && (
                        <View style={styles.stepContainer}>
                            <Text style={styles.heading}>Opening Hours</Text>
                            <Text style={styles.subHeading}>Set your hours for each day of the week.</Text>

                            <View style={styles.hoursContainer}>
                                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                                    const dayData = formData.working_hours[day];
                                    const isOpen = dayData !== null;
                                    const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);

                                    return (
                                        <View key={day} style={styles.dayRow}>
                                            <View style={styles.dayHeader}>
                                                <Text style={styles.dayLabel}>{dayLabel}</Text>
                                                <TouchableOpacity
                                                    style={[styles.toggleButton, isOpen && styles.toggleButtonActive]}
                                                    onPress={() => {
                                                        setFormData(prev => ({
                                                            ...prev,
                                                            working_hours: {
                                                                ...prev.working_hours,
                                                                [day]: isOpen ? null : { open: '09:00', close: '22:00' }
                                                            }
                                                        }));
                                                    }}
                                                    activeOpacity={0.7}
                                                >
                                                    <Text style={[styles.toggleText, isOpen && styles.toggleTextActive]}>
                                                        {isOpen ? 'Open' : 'Closed'}
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>

                                            {isOpen && dayData && (
                                                <View style={styles.timeInputRow}>
                                                    <TimePickerField
                                                        label="Opens"
                                                        value={dayData.open}
                                                        onChange={(text: string) => {
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                working_hours: {
                                                                    ...prev.working_hours,
                                                                    [day]: { ...dayData, open: text }
                                                                }
                                                            }));
                                                        }}
                                                    />

                                                    <Text style={styles.timeSeparator}>-</Text>

                                                    <TimePickerField
                                                        label="Closes"
                                                        value={dayData.close}
                                                        onChange={(text: string) => {
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                working_hours: {
                                                                    ...prev.working_hours,
                                                                    [day]: { ...dayData, close: text }
                                                                }
                                                            }));
                                                        }}
                                                    />
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    )}


                </ScrollView>

                <View style={styles.footer}>
                    <BlurView intensity={20} tint="dark" style={styles.footerBlur}>
                        <TouchableOpacity style={styles.nextButton} onPress={nextStep} disabled={submitting}>
                            <Text style={styles.nextButtonText}>
                                {step === totalSteps ? (submitting ? 'Saving...' : 'Save Profile') : 'Continue'}
                            </Text>
                            <Ionicons name="arrow-forward" size={20} color="white" />
                        </TouchableOpacity>
                    </BlurView>
                </View>
            </KeyboardAvoidingView>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16, // iOS margin
        paddingTop: 16,
        gap: 16,
    },
    backButton: {
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
    },
    progressContainer: {
        flex: 1,
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        overflow: 'hidden',
    },
    progressBar: {
        height: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 3,
    },
    stepText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 14,
        fontWeight: '600',
    },
    scrollContent: {
        padding: 16, // iOS margin
        paddingBottom: 100,
    },
    brandHeader: {
        alignItems: 'center',
        marginBottom: 24,
    },
    brandLogo: {
        width: 64,
        height: 64,
        marginBottom: 8,
    },
    brandText: {
        fontSize: 24,
        fontFamily: 'Notable_400Regular',
        color: Colors.text.primary,
        letterSpacing: 2,
    },
    stepContainer: {
        gap: 10,
    },
    heading: {
        fontSize: 32,
        fontWeight: '800',
        color: 'white',
        letterSpacing: -0.5,
    },
    subHeading: {
        fontSize: 17, // iOS Body
        color: 'rgba(255,255,255,0.6)',
        marginBottom: 24,
        lineHeight: 22,
    },
    inputGroup: {
        marginBottom: 24,
        gap: 8,
    },
    label: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        fontWeight: '600',
        marginLeft: 4,
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12, // iOS standard radius
        padding: 16,
        color: 'white',
        fontSize: 17, // iOS body size
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    chipHelpers: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 10,
    },
    chip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    activeChip: {
        backgroundColor: Colors.cta.primary,
        borderColor: Colors.cta.primary,
    },
    chipText: {
        color: 'rgba(255,255,255,0.6)',
        fontWeight: '600',
    },
    activeChipText: {
        color: 'white',
    },
    slideshowScroll: {
        gap: 12,
        paddingRight: 20,
        paddingTop: 12,
        marginBottom: 20,
    },
    addImageButton: {
        width: 100,
        height: 140,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    addImageText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 4,
    },
    slideshowItem: {
        position: 'relative',
        width: 100,
        height: 140,
    },
    slideshowImage: {
        width: '100%',
        height: '100%',
        borderRadius: 12,
    },
    removeImageButton: {
        position: 'absolute',
        top: -8,
        right: -8,
        backgroundColor: 'black',
        borderRadius: 12,
    },
    helperText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        marginTop: 4,
        marginLeft: 4,
    },
    suggestionList: {
        marginTop: 4,
        backgroundColor: 'rgba(0,0,0,0.9)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    suggestionItem: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    suggestionText: {
        color: Colors.text.primary,
        fontSize: 14,
        fontWeight: '600',
    },
    suggestionSubText: {
        color: Colors.text.secondary,
        fontSize: 12,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
    },
    footerBlur: {
        padding: 10,
    },
    nextButton: {
        backgroundColor: Colors.cta.primary,
        paddingVertical: 16,
        borderRadius: 12, // iOS standard radius
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        shadowColor: Colors.cta.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    nextButtonText: {
        color: 'white',
        fontSize: 17, // iOS body bold
        fontWeight: 'bold',
    },
    // Working Hours Styles
    hoursContainer: {
        gap: 16,
        marginTop: 8,
    },
    dayRow: {
        gap: 12,
    },
    dayHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    dayLabel: {
        color: Colors.text.primary,
        fontSize: 16,
        fontWeight: '600',
    },
    toggleButton: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        minWidth: 80,
        alignItems: 'center',
    },
    toggleButtonActive: {
        backgroundColor: Colors.cta.primary,
        borderColor: Colors.cta.primary,
    },
    toggleText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 14,
        fontWeight: '600',
    },
    toggleTextActive: {
        color: 'white',
    },
    timeInputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginTop: 8,
    },
    timeSeparator: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 18,
        fontWeight: '600',
        marginTop: 20,
    },
});
