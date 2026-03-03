/**
 * UploadContext - Global upload state for Instagram-like background uploads.
 * 
 * Usage:
 *   1. Wrap your app root with <UploadProvider>
 *   2. Call `startUpload(uploadFn)` from create.tsx to kick off an upload 
 *      and navigate back immediately.
 *   3. Consume `uploadState` anywhere to show a progress bar.
 */

import React, { createContext, useCallback, useContext, useState } from 'react';

type UploadState = 'idle' | 'uploading' | 'success' | 'error';

export interface PendingPost {
    id: string;
    media_url: string; // The local URI of the file being uploaded
    media_type: 'image' | 'video';
    caption?: string;
    created_at: string;
    isPending: boolean; // Flag to identify it in the feed
}

interface UploadContextType {
    uploadState: UploadState;
    uploadProgress: number; // 0-1
    pendingPost: PendingPost | null;
    startUpload: (post: PendingPost, uploadFn: () => Promise<void>) => void;
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

    const startUpload = useCallback(async (post: PendingPost, uploadFn: () => Promise<void>) => {
        setUploadState('uploading');
        setUploadProgress(0.1); // Immediately show progress to signal upload started
        setPendingPost(post);

        try {
            // Simulate incremental progress for UX (actual Supabase SDK doesn't expose upload progress)
            const interval = setInterval(() => {
                setUploadProgress(prev => {
                    if (prev >= 0.9) {
                        clearInterval(interval);
                        return 0.9;
                    }
                    return prev + 0.08;
                });
            }, 400);

            await uploadFn();

            clearInterval(interval);
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
