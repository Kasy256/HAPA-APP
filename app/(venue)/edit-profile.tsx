import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { PhoneInput } from '@/components/PhoneInput';
import { TimePickerField } from '@/components/TimePickerField';
import { apiFetch } from '@/lib/api';

const CATEGORIES = ['Restaurant', 'Bar', 'Club', 'Cafe', 'Live Music', 'Lounge', 'Outdoor', 'Rooftop'];

export default function EditProfileScreen() {
    const router = useRouter();
    const [venueId, setVenueId] = useState<string | null>(null);
    const [name, setName] = useState('');
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [location, setLocation] = useState(''); // "Area, City"
    const [contact, setContact] = useState('');

    // Working Hours State
    const [workingHours, setWorkingHours] = useState<Record<string, { open: string; close: string } | null>>({
        monday: { open: '09:00', close: '22:00' },
        tuesday: { open: '09:00', close: '22:00' },
        wednesday: { open: '09:00', close: '22:00' },
        thursday: { open: '09:00', close: '22:00' },
        friday: { open: '09:00', close: '22:00' },
        saturday: { open: '09:00', close: '22:00' },
        sunday: { open: '09:00', close: '22:00' },
    });

    // Images State
    const [slideshowImages, setSlideshowImages] = useState<string[]>([]);
    const [avatar, setAvatar] = useState<string>('');
    const [locationSuggestions, setLocationSuggestions] = useState<any[]>([]);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await apiFetch('/api/venues/me', { auth: true });
                const v = res.venue;
                if (!v) return;
                setVenueId(v.id);
                setName(v.name ?? '');
                setSelectedCategories(v.categories ?? []);
                const loc = [v.area, v.city].filter(Boolean).join(', ');
                setLocation(loc);
                setContact(v.contact_phone ?? '');
                setSlideshowImages(v.images ?? []);
                setAvatar((v.images && v.images[0]) || '');
                // Load working hours if available
                if (v.working_hours) {
                    setWorkingHours(v.working_hours);
                }
            } catch {
                // leave empty
            }
        };
        load();
    }, []);

    const toggleCategory = (cat: string) => {
        if (selectedCategories.includes(cat)) {
            setSelectedCategories(prev => prev.filter(c => c !== cat));
        } else {
            setSelectedCategories(prev => [...prev, cat]);
        }
    };

    const pickImage = async (isAvatar: boolean = false) => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false, // User requested no cropping
            quality: 0.8,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            const uri = result.assets[0].uri;
            if (isAvatar) {
                setAvatar(uri);
            } else {
                setSlideshowImages(prev => [...prev, uri]);
            }
        }
    };

    const removeSlideshowImage = (index: number) => {
        setSlideshowImages(prev => prev.filter((_, i) => i !== index));
    };

    const handleSave = () => {
        // Validation
        if (selectedCategories.length === 0) {
            Alert.alert('Missing Info', 'Please select at least one category.');
            return;
        }

        if (!venueId) {
            Alert.alert('Missing venue', 'No venue profile found to update.');
            return;
        }

        const [areaRaw, cityRaw] = location.split(',').map(s => s.trim());
        const area = cityRaw ? areaRaw : '';
        const city = cityRaw ? cityRaw : areaRaw;

        apiFetch(`/api/venues/${venueId}`, {
            method: 'PATCH',
            auth: true,
            body: JSON.stringify({
                name,
                categories: selectedCategories,
                area,
                city,
                contact_phone: contact,
                images: slideshowImages,
                working_hours: workingHours,
            }),
        })
            .then(() => {
                Alert.alert('Success', 'Profile updated successfully', [
                    { text: 'OK', onPress: () => router.back() },
                ]);
            })
            .catch((e: any) => {
                Alert.alert('Error', e.message || 'Failed to update profile');
            });
    };

    const fetchLocationSuggestions = async (text: string) => {
        const trimmed = text.trim();
        if (trimmed.length < 3) {
            setLocationSuggestions([]);
            return;
        }
        try {
            const res = await apiFetch(`/api/locations/suggest?q=${encodeURIComponent(trimmed)}`);
            setLocationSuggestions(res.suggestions || []);
        } catch {
            setLocationSuggestions([]);
        }
    };

    return (
        <ScreenWrapper style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="white" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Edit Profile</Text>
                <TouchableOpacity onPress={handleSave}>
                    <Text style={styles.saveText}>Save</Text>
                </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>

                {/* Avatar Section */}
                <View style={styles.avatarSection}>
                    <View style={styles.avatarContainer}>
                        <Image source={{ uri: avatar }} style={styles.avatar} />
                        <TouchableOpacity style={styles.avatarEditBadge} onPress={() => pickImage(true)}>
                            <Ionicons name="camera" size={16} color="white" />
                        </TouchableOpacity>
                    </View>
                    <Text style={styles.avatarHelperText}>Tap to change profile photo</Text>
                </View>

                {/* Slideshow Images Section */}
                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionLabel}>Venue Slideshow</Text>
                    <Text style={styles.helperText}>These images will appear on your discovery card.</Text>

                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slideshowScroll}>
                        <TouchableOpacity style={styles.addImageButton} onPress={() => pickImage(false)}>
                            <Ionicons name="add" size={32} color="rgba(255,255,255,0.5)" />
                            <Text style={styles.addImageText}>Add</Text>
                        </TouchableOpacity>

                        {slideshowImages.map((uri, index) => (
                            <View key={index} style={styles.slideshowItem}>
                                <Image source={{ uri }} style={styles.slideshowImage} />
                                <TouchableOpacity style={styles.removeImageButton} onPress={() => removeSlideshowImage(index)}>
                                    <Ionicons name="close-circle" size={24} color={Colors.cta.primary} />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                </View>

                {/* Form Fields */}
                <View style={styles.form}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Venue Name</Text>
                        <TextInput
                            style={styles.input}
                            value={name}
                            onChangeText={setName}
                            placeholderTextColor="rgba(255,255,255,0.3)"
                        />
                    </View>

                    {/* Multi-Select Category */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Categories</Text>
                        <View style={styles.categoryContainer}>
                            {CATEGORIES.map(cat => (
                                <TouchableOpacity
                                    key={cat}
                                    style={[styles.categoryBadge, selectedCategories.includes(cat) && styles.categoryBadgeActive]}
                                    onPress={() => toggleCategory(cat)}
                                >
                                    <Text style={[styles.categoryText, selectedCategories.includes(cat) && styles.categoryTextActive]}>{cat}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Location</Text>
                        <TextInput
                            style={styles.input}
                            value={location}
                            onChangeText={t => {
                                setLocation(t);
                                fetchLocationSuggestions(t);
                            }}
                            placeholderTextColor="rgba(255,255,255,0.3)"
                        />
                        {locationSuggestions.length > 0 && (
                            <View style={styles.suggestionList}>
                                {locationSuggestions.map((s: any) => (
                                    <TouchableOpacity
                                        key={s.id}
                                        style={styles.suggestionItem}
                                        onPress={() => {
                                            setLocation(s.address || s.name);
                                            setLocationSuggestions([]);
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

                    {/* Working Hours - Day by Day */}
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Working Hours</Text>
                        <View style={styles.hoursContainer}>
                            {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                                const dayData = workingHours[day];
                                const isOpen = dayData !== null;
                                const dayLabel = day.charAt(0).toUpperCase() + day.slice(1);

                                return (
                                    <View key={day} style={styles.dayRow}>
                                        <View style={styles.dayHeader}>
                                            <Text style={styles.dayLabel}>{dayLabel}</Text>
                                            <TouchableOpacity
                                                style={[styles.toggleButton, isOpen && styles.toggleButtonActive]}
                                                onPress={() => {
                                                    setWorkingHours(prev => ({
                                                        ...prev,
                                                        [day]: isOpen ? null : { open: '09:00', close: '22:00' }
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
                                                        setWorkingHours(prev => ({
                                                            ...prev,
                                                            [day]: { ...dayData, open: text }
                                                        }));
                                                    }}
                                                />

                                                <Text style={styles.timeSeparator}>-</Text>

                                                <TimePickerField
                                                    label="Closes"
                                                    value={dayData.close}
                                                    onChange={(text: string) => {
                                                        setWorkingHours(prev => ({
                                                            ...prev,
                                                            [day]: { ...dayData, close: text }
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

                    <View style={styles.inputGroup}>
                        <PhoneInput
                            label="Contact Number"
                            value={contact}
                            onChange={setContact}
                        />
                    </View>
                </View>

                <View style={{ height: 100 }} />
            </ScrollView>
        </ScreenWrapper>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background.gradient[2],
        paddingHorizontal: 20,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 16,
        marginBottom: 10,
    },
    backButton: {
        padding: 8,
        marginLeft: -8,
    },
    headerTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    saveText: {
        color: Colors.cta.primary,
        fontSize: 16,
        fontWeight: 'bold',
    },
    avatarSection: {
        alignItems: 'center',
        marginBottom: 30,
    },
    avatarContainer: {
        width: 100,
        height: 100,
        position: 'relative',
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        borderWidth: 3,
        borderColor: Colors.cta.primary,
    },
    avatarEditBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: Colors.cta.primary,
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: 'black',
    },
    avatarHelperText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        marginTop: 8,
    },
    sectionContainer: {
        marginBottom: 30,
    },
    sectionLabel: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    helperText: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        marginBottom: 12,
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
    slideshowScroll: {
        gap: 12,
        paddingRight: 20,
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
    form: {
        gap: 24,
    },
    inputGroup: {
        gap: 10,
    },
    label: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        fontWeight: '600',
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 16,
        color: 'white',
        fontSize: 16,
    },
    categoryContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    categoryBadge: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    categoryBadgeActive: {
        backgroundColor: 'rgba(222, 45, 148, 0.2)',
        borderColor: Colors.cta.primary,
    },
    categoryText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 14,
    },
    categoryTextActive: {
        color: Colors.cta.primary,
        fontWeight: '600',
    },
    timeRow: {
        flexDirection: 'row',
        gap: 12,
    },
    timeInputContainer: {
        flex: 1,
        gap: 6,
    },
    timeLabel: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 4,
    },
    timeButton: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    timeText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '500',
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
