import { Colors } from '@/constants/Colors';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

type CountryOption = {
    code: string; // e.g. "+256"
    label: string; // e.g. "Uganda"
    flag: string; // emoji flag
};

const COUNTRIES: CountryOption[] = [
    { code: '+256', label: 'Uganda', flag: '🇺🇬' },
    { code: '+254', label: 'Kenya', flag: '🇰🇪' },
    { code: '+255', label: 'Tanzania', flag: '🇹🇿' },
];

type PhoneInputProps = {
    label?: string;
    value: string;
    onChange: (value: string) => void;
};

export function PhoneInput({ label, value, onChange }: PhoneInputProps) {
    const [selectedCountry, setSelectedCountry] = useState<CountryOption>(COUNTRIES[0]);
    const [pickerOpen, setPickerOpen] = useState(false);

    // Derive local number from full value
    const getLocalNumber = () => {
        if (!value) return '';
        const match = COUNTRIES.find(c => value.startsWith(c.code));
        if (match) {
            return value.slice(match.code.length).trimStart();
        }
        return value;
    };

    const [localNumber, setLocalNumber] = useState(getLocalNumber());

    // Sync localNumber + selected country when value changes from outside
    useEffect(() => {
        const match = COUNTRIES.find(c => value.startsWith(c.code));
        if (match) {
            setSelectedCountry(match);
        }
        setLocalNumber(getLocalNumber());
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handleSelectCountry = (country: CountryOption) => {
        setSelectedCountry(country);
        setPickerOpen(false);

        const next = `${country.code} ${localNumber}`.trim();
        onChange(next);
    };

    const handleNumberChange = (text: string) => {
        setLocalNumber(text);
        const full = `${selectedCountry.code} ${text}`.trim();
        onChange(full);
    };

    return (
        <View style={styles.container}>
            {label && <Text style={styles.label}>{label}</Text>}
            <View style={styles.inputRow}>
                <TouchableOpacity
                    activeOpacity={0.8}
                    style={styles.countryButton}
                    onPress={() => setPickerOpen(!pickerOpen)}
                >
                    <Text style={styles.flag}>{selectedCountry.flag}</Text>
                    <Text style={styles.codeText}>{selectedCountry.code}</Text>
                    <Text style={styles.chevron}>▾</Text>
                </TouchableOpacity>

                <TextInput
                    style={styles.phoneInput}
                    value={localNumber}
                    onChangeText={handleNumberChange}
                    keyboardType="phone-pad"
                    placeholder="Phone number"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                />
            </View>

            {pickerOpen && (
                <View style={styles.dropdown}>
                    {COUNTRIES.map(country => (
                        <TouchableOpacity
                            key={country.code}
                            style={styles.dropdownItem}
                            onPress={() => handleSelectCountry(country)}
                        >
                            <Text style={styles.flag}>{country.flag}</Text>
                            <View style={styles.dropdownTextContainer}>
                                <Text style={styles.dropdownLabel}>{country.label}</Text>
                                <Text style={styles.dropdownCode}>{country.code}</Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: '100%',
        marginBottom: 24,
    },
    label: {
        color: Colors.text.primary,
        fontSize: 15,
        marginBottom: 8,
        fontWeight: '600',
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1C1C1C',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.card.border,
        paddingHorizontal: 8,
    },
    countryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 10,
        borderRightWidth: 1,
        borderRightColor: 'rgba(255,255,255,0.12)',
        gap: 4,
    },
    flag: {
        fontSize: 18,
        marginRight: 4,
    },
    codeText: {
        color: Colors.text.primary,
        fontSize: 15,
        fontWeight: '600',
    },
    chevron: {
        color: 'rgba(255,255,255,0.5)',
        marginLeft: 4,
        fontSize: 12,
    },
    phoneInput: {
        flex: 1,
        paddingHorizontal: 8,
        paddingVertical: 12,
        color: Colors.text.primary,
        fontSize: 17,
    },
    dropdown: {
        marginTop: 8,
        backgroundColor: 'rgba(0,0,0,0.95)',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden',
    },
    dropdownItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.06)',
    },
    dropdownTextContainer: {
        marginLeft: 8,
    },
    dropdownLabel: {
        color: Colors.text.primary,
        fontSize: 14,
        fontWeight: '600',
    },
    dropdownCode: {
        color: Colors.text.secondary,
        fontSize: 12,
        marginTop: 2,
    },
});

