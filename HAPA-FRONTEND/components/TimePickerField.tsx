import { Colors } from '@/constants/Colors';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import React, { useState } from 'react';
import {
    Modal,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

interface TimePickerFieldProps {
    value: string; // "HH:MM" format (24h)
    onChange: (time: string) => void;
    placeholder?: string;
    label?: string;
}

export function TimePickerField({ value, onChange, placeholder = "00:00", label }: TimePickerFieldProps) {
    const [showPicker, setShowPicker] = useState(false);

    // Convert "HH:MM" string to Date object for the picker
    const getDateFromTime = (timeString: string) => {
        const date = new Date();
        if (!timeString) return date;

        const [hours, minutes] = timeString.split(':').map(Number);
        if (isNaN(hours) || isNaN(minutes)) return date;

        date.setHours(hours);
        date.setMinutes(minutes);
        date.setSeconds(0);
        return date;
    };

    const handleChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
        if (Platform.OS === 'android') {
            setShowPicker(false);
        }

        if (event.type === 'dismissed') {
            return;
        }

        if (selectedDate) {
            const hours = selectedDate.getHours().toString().padStart(2, '0');
            const minutes = selectedDate.getMinutes().toString().padStart(2, '0');
            onChange(`${hours}:${minutes}`);
        }
    };

    const confirmIOS = () => {
        setShowPicker(false);
    };

    const pickerDate = getDateFromTime(value);

    return (
        <View style={styles.container}>
            {label && <Text style={styles.label}>{label}</Text>}
            <TouchableOpacity
                style={styles.field}
                onPress={() => setShowPicker(true)}
                activeOpacity={0.7}
            >
                <Text style={[styles.text, !value && styles.placeholder]}>
                    {value || placeholder}
                </Text>
            </TouchableOpacity>

            {/* Android Picker */}
            {Platform.OS === 'android' && showPicker && (
                <DateTimePicker
                    value={pickerDate}
                    mode="time"
                    is24Hour={true}
                    display="default"
                    onChange={handleChange}
                />
            )}

            {/* iOS Modal Picker */}
            {Platform.OS === 'ios' && (
                <Modal
                    visible={showPicker}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowPicker(false)}
                >
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.pickerHeader}>
                                <TouchableOpacity onPress={() => setShowPicker(false)}>
                                    <Text style={styles.cancelText}>Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={confirmIOS}>
                                    <Text style={styles.doneText}>Done</Text>
                                </TouchableOpacity>
                            </View>
                            <DateTimePicker
                                value={pickerDate}
                                mode="time"
                                is24Hour={true}
                                display="spinner"
                                onChange={handleChange}
                                style={styles.iosPicker}
                                themeVariant="dark"
                            />
                        </View>
                    </View>
                </Modal>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        gap: 6,
    },
    label: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 4,
    },
    field: {
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    text: {
        color: 'white',
        fontSize: 16,
        fontWeight: '600',
    },
    placeholder: {
        color: 'rgba(255,255,255,0.3)',
    },
    // iOS Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: '#1C1C1E', // iOS Dark Mode gray
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        paddingBottom: 20, // safe area padding
    },
    pickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    cancelText: {
        color: Colors.text.secondary,
        fontSize: 16,
    },
    doneText: {
        color: Colors.cta.primary,
        fontSize: 16,
        fontWeight: '600',
    },
    iosPicker: {
        height: 200,
        backgroundColor: '#1C1C1E',
    },
});
