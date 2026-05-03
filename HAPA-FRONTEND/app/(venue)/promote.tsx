
import React, { useState } from 'react';
import { 
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  TextInput, Image, Alert, ActivityIndicator 
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Colors } from '@/constants/Colors';
import { apiFetch } from '@/lib/api';
import { useSubscription } from '@/hooks/useSubscription';
import { uploadMedia } from '@/lib/supabaseClient';

export default function PromoteEventScreen() {
  const router = useRouter();
  const subscription = useSubscription();

  const [media, setMedia] = useState<{ uri: string; type: 'image' | 'video' }[]>([]);
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [ctaUrl, setCtaUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      const selectedMedia = result.assets.map(asset => ({
        uri: asset.uri,
        type: asset.type === 'video' ? 'video' : 'image' as any,
      }));
      setMedia(prev => [...prev, ...selectedMedia]);
    }
  };

  const removeMedia = (index: number) => {
    setMedia(prev => prev.filter((_, i) => i !== index));
  };

  const handlePromote = async () => {
    if (media.length === 0) return Alert.alert('Error', 'Please select at least one image or video for your ad.');
    if (!title) return Alert.alert('Error', 'Please enter an event title.');
    
    // Check Tier Limits
    if (subscription.tier === 'free') {
      return Alert.alert('Hapa Pro Required', 'Promoting events is a Pro feature. Upgrade to reach more customers!', [
        { text: 'Later', style: 'cancel' },
        { text: 'Upgrade', onPress: () => router.push('/(venue)/subscription') }
      ]);
    }

    setIsSubmitting(true);
    try {
      // 1. Upload all media items to Supabase
      const uploadedUrls = await Promise.all(
        media.map(async (item) => {
          const path = await uploadMedia(item.uri, { type: item.type });
          if (!path) throw new Error('Failed to upload some media items');
          return path;
        })
      );

      // 2. Create the Event Post
      await apiFetch('/api/posts', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({
          media_type: media[0].type, // Primary media type
          media_url: JSON.stringify(uploadedUrls), // Slideshow array
          caption: title,
          post_type: 'event',
          event_date: eventDate.toISOString(),
          cta_url: ctaUrl,
          cta_label: 'Book Now',
        })
      });

      Alert.alert('Success!', 'Your event is now being promoted in the HAPA feed.');
      router.back();
    } catch (err: any) {
      console.error('[Promote] Error:', err);
      Alert.alert('Promotion Failed', err.message || 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScreenWrapper style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="white" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Promote Event</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Media Selection */}
        <Text style={styles.sectionLabel}>Event Poster / Video</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.mediaList}>
          {media.map((item, index) => (
            <View key={index} style={styles.mediaItem}>
              <Image source={{ uri: item.uri }} style={styles.mediaThumbnail} />
              <TouchableOpacity style={styles.removeMedia} onPress={() => removeMedia(index)}>
                <Ionicons name="close-circle" size={20} color="white" />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addMedia} onPress={pickMedia}>
            <Ionicons name="add" size={40} color="rgba(255,255,255,0.4)" />
            <Text style={styles.addMediaText}>Add Gallery</Text>
          </TouchableOpacity>
        </ScrollView>

        {/* Details Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Event Title</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Saturday Night Rave"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={title}
            onChangeText={setTitle}
          />

          <Text style={styles.label}>Event Date</Text>
          <TouchableOpacity style={styles.dateSelector} onPress={() => setShowDatePicker(true)}>
            <Ionicons name="calendar-outline" size={20} color="white" />
            <Text style={styles.dateText}>{eventDate.toLocaleDateString()}</Text>
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={eventDate}
              mode="date"
              display="default"
              onChange={(e, date) => {
                setShowDatePicker(false);
                if (date) setEventDate(date);
              }}
            />
          )}

          <Text style={styles.label}>Booking / Ticket Link (Optional)</Text>
          <TextInput
            style={styles.input}
            placeholder="https://tickets.com/event"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={ctaUrl}
            onChangeText={setCtaUrl}
            autoCapitalize="none"
            keyboardType="url"
          />
        </View>

        {/* Promotion Benefits */}
        <View style={styles.benefitsCard}>
          <Ionicons name="rocket-outline" size={24} color="#FFD700" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.benefitTitle}>Boost Visibility</Text>
            <Text style={styles.benefitDesc}>
              This ad will appear in the main Discover feed for users in your city until the event ends.
            </Text>
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.promoteButton, isSubmitting && { opacity: 0.7 }]}
          onPress={handlePromote}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.promoteButtonText}>Launch Promotion</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </ScreenWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  backButton: {
    padding: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
  },
  headerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  scrollContent: {
    padding: 20,
  },
  sectionLabel: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  mediaList: {
    marginBottom: 30,
  },
  mediaItem: {
    width: 120,
    height: 180,
    borderRadius: 12,
    marginRight: 12,
    overflow: 'hidden',
  },
  mediaThumbnail: {
    width: '100%',
    height: '100%',
  },
  removeMedia: {
    position: 'absolute',
    top: 5,
    right: 5,
  },
  addMedia: {
    width: 120,
    height: 180,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addMediaText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 8,
  },
  form: {
    gap: 16,
    marginBottom: 30,
  },
  label: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    color: 'white',
    fontSize: 16,
  },
  dateSelector: {
    backgroundColor: '#1C1C1E',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dateText: {
    color: 'white',
    fontSize: 16,
  },
  benefitsCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.2)',
    marginBottom: 30,
  },
  benefitTitle: {
    color: '#FFD700',
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 4,
  },
  benefitDesc: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
  },
  promoteButton: {
    backgroundColor: Colors.cta.primary,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  promoteButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
