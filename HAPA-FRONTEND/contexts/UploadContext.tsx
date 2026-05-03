import React, { createContext, useCallback, useContext, useState } from 'react';
import { uploadMedia, supabase } from '@/lib/supabaseClient';
import { apiFetch } from '@/lib/api';

// Graceful fallback for Expo Go / Missing Native Module
let VideoCompressor: any = null;
let ImageCompressor: any = null;
try {
    const compressor = require('react-native-compressor');
    VideoCompressor = compressor.Video;
    ImageCompressor = compressor.Image;
} catch (e) {
    console.warn('[UploadContext] react-native-compressor native module not found. Falling back to raw uncompressed uploads.');
}

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export interface PendingPost {
    id: string;
    media_url: string; // The local URI of the file being uploaded
    media_type: 'image' | 'video';
    caption?: string;
    created_at: string;
    isPending: boolean; // Flag to identify it in the feed
}

interface PostData {
    items: { uri: string; type: 'image' | 'video' }[];
    caption?: string;
    venue_id?: string;
    hashtag?: string;
    is_user_post?: boolean;
}

interface UploadContextType {
    uploadState: UploadState;
    uploadProgress: number; // 0-1
    pendingPost: PendingPost | null;
    startUpload: (postData: PostData) => void;
}

const UploadContext = createContext<UploadContextType>({
    uploadState: 'idle',
    uploadProgress: 0,
    pendingPost: null,
    startUpload: () => { },
});

export function UploadProvider({ children }: { children: React.ReactNode }) {
    const [uploadState, setUploadState] = useState<UploadState>('idle');
    const [uploadProgress, setUploadProgress] = useState(0);
    const [pendingPost, setPendingPost] = useState<PendingPost | null>(null);

    const startUpload = useCallback(async (postData: PostData) => {
        setUploadState('uploading');
        setUploadProgress(0.1);

        // Generate a temporary ID for local optimistic UI
        const tempId = `temp_${Date.now()}`;
        const firstItem = postData.items[0];
        const pending: PendingPost = {
            id: tempId,
            media_url: firstItem.uri,
            media_type: firstItem.type,
            caption: postData.caption,
            created_at: new Date().toISOString(),
            isPending: true,
        };
        setPendingPost(pending);

        try {
            const uploadedUrls: string[] = [];
            const totalItems = postData.items.length;

            for (let i = 0; i < totalItems; i++) {
                const item = postData.items[i];
                const itemType = item.type;
                let currentUri = item.uri;

                console.log(`[UploadContext] Processing item ${i + 1}/${totalItems} (${itemType})...`);

                // 1. NATIVE COMPRESSION (If Available)
                if (VideoCompressor && ImageCompressor) {
                    if (itemType === 'video') {
                        currentUri = await VideoCompressor.compress(
                            item.uri,
                            { compressionMethod: 'auto' },
                            (progress: number) => {
                                // Sub-progress calculation: 0.1 to 0.4 range shared across all items
                                const base = 0.1 + (i / totalItems) * 0.3;
                                setUploadProgress(base + (progress * (0.3 / totalItems)));
                            }
                        );
                    } else {
                        currentUri = await ImageCompressor.compress(item.uri, {
                            compressionMethod: 'auto',
                        });
                        setUploadProgress(0.1 + ((i + 0.5) / totalItems) * 0.3);
                    }
                }

                // 2. STORAGE UPLOAD
                const uploadedUrl = await uploadMedia(currentUri, {
                    bucket: 'media',
                    folder: 'vibes',
                    type: itemType,
                });
                uploadedUrls.push(uploadedUrl);
                
                setUploadProgress(0.4 + ((i + 1) / totalItems) * 0.5);
            }

            console.log('[UploadContext] All items uploaded. Sending to backend...');

            // 3. BACKEND API
            await supabase.auth.refreshSession();
            
            // If multiple items, we store as JSON array. Feed logic will detect this.
            const finalMediaUrl = uploadedUrls.length > 1 
                ? JSON.stringify(uploadedUrls) 
                : uploadedUrls[0];

            const postBody = {
                media_type: postData.items[0].type,
                media_url: finalMediaUrl,
                caption: postData.caption?.trim() || undefined,
                venue_id: postData.venue_id,
                hashtag: postData.hashtag,
                is_user_post: postData.is_user_post ?? true, // Default to user post if not specified
            };

            await apiFetch('/api/posts', {
                method: 'POST',
                body: JSON.stringify(postBody),
            });

            console.log('[UploadContext] Post fully published!');

            setUploadProgress(1);
            setUploadState('success');

            // Auto-reset after a brief display
            setTimeout(() => {
                setUploadState('idle');
                setUploadProgress(0);
                setPendingPost(null);
            }, 2000);
        } catch (error) {
            console.error('[UploadContext] Upload failed:', error);
            setUploadState('error');
            // Auto-reset error state
            setTimeout(() => {
                setUploadState('idle');
                setUploadProgress(0);
                setPendingPost(null);
            }, 3000);
        }
    }, []);

    return (
        <UploadContext.Provider value={{ uploadState, uploadProgress, pendingPost, startUpload }}>
            {children}
        </UploadContext.Provider>
    );
}

export function useUpload() {
    return useContext(UploadContext);
}
