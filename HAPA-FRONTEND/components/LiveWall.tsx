import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState, useRef } from 'react';
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View, FlatList, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { apiFetch } from '@/lib/api';
import { getTimeAgo } from '@/lib/time';

interface LiveWallProps {
    visible: boolean;
    onClose: () => void;
    venueId?: string;
    postId?: string;
    hashtag?: string;
    title: string;
    onCommentPosted?: () => void;
}

export function LiveWall({ visible, onClose, venueId, postId, hashtag, title, onCommentPosted }: LiveWallProps) {
    const [comments, setComments] = useState<any[]>([]);
    const [newComment, setNewComment] = useState('');
    const [loading, setLoading] = useState(false);
    const [posting, setPosting] = useState(false);

    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        if (visible) {
            fetchComments();
        }
    }, [visible, venueId, postId, hashtag]);

    const fetchComments = async () => {
        setLoading(true);
        try {
            let endpoint = '';
            if (postId) {
                endpoint = `/api/comments/post/${postId}`;
            } else if (venueId) {
                endpoint = `/api/comments/venue/${venueId}`;
            } else {
                endpoint = `/api/comments/hashtag/${hashtag}`;
            }
            const res = await apiFetch(endpoint);
            setComments(res.comments || []);
        } catch (e) {
            console.error('Failed to fetch comments:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSend = async () => {
        if (!newComment.trim()) return;
        setPosting(true);
        try {
            const body: any = { content: newComment.trim() };
            if (postId) {
                body.post_id = postId;
            } else if (venueId) {
                body.venue_id = venueId;
            } else {
                body.hashtag = hashtag;
            }

            const res = await apiFetch('/api/comments', {
                method: 'POST',
                body: JSON.stringify(body)
            });
            setComments(prev => [res.comment, ...prev]);
            setNewComment('');
            onCommentPosted?.();
            // Scroll to top
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        } catch (e) {
            console.error('Failed to post comment:', e);
        } finally {
            setPosting(false);
        }
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.modalOverlay}>
                <KeyboardAvoidingView 
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={styles.container}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <View style={styles.indicator} />
                        <View style={styles.headerContent}>
                            <Text style={styles.title}>Live Wall: {title}</Text>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <Ionicons name="close-circle" size={28} color="rgba(255,255,255,0.3)" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Comments List */}
                    {loading ? (
                        <View style={styles.center}>
                            <ActivityIndicator color={Colors.cta.primary} />
                        </View>
                    ) : (
                        <FlatList
                            ref={flatListRef}
                            data={comments}
                            keyExtractor={item => item.id}
                            contentContainerStyle={styles.listContent}
                            renderItem={({ item }) => (
                                <View style={styles.commentItem}>
                                    <View style={styles.commentHeader}>
                                        <Text style={styles.author}>{item.author_alias}</Text>
                                        <Text style={styles.time}>{getTimeAgo(item.created_at)}</Text>
                                    </View>
                                    <Text style={styles.content}>{item.content}</Text>
                                </View>
                            )}
                            ListEmptyComponent={
                                <View style={styles.emptyState}>
                                    <Ionicons name="chatbubbles-outline" size={48} color="rgba(255,255,255,0.1)" />
                                    <Text style={styles.emptyText}>No messages yet. Be the first to vibe!</Text>
                                </View>
                            }
                        />
                    )}

                    {/* Input Bar */}
                    <View style={styles.inputBar}>
                        <TextInput
                            style={styles.input}
                            placeholder="Say something..."
                            placeholderTextColor="rgba(255,255,255,0.4)"
                            value={newComment}
                            onChangeText={setNewComment}
                            multiline
                        />
                        <TouchableOpacity 
                            style={[styles.sendBtn, !newComment.trim() && styles.sendBtnDisabled]} 
                            onPress={handleSend}
                            disabled={!newComment.trim() || posting}
                        >
                            {posting ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="send" size={20} color="white" />}
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    container: {
        height: '80%',
        backgroundColor: '#1C1C1E',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        overflow: 'hidden',
    },
    header: {
        alignItems: 'center',
        paddingTop: 10,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    indicator: {
        width: 40,
        height: 4,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 2,
        marginBottom: 10,
    },
    headerContent: {
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingBottom: 15,
    },
    title: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    closeBtn: {
        padding: 5,
    },
    listContent: {
        padding: 20,
        paddingBottom: 40,
    },
    commentItem: {
        marginBottom: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 12,
        borderRadius: 12,
    },
    commentHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    author: {
        color: Colors.cta.primary,
        fontWeight: 'bold',
        fontSize: 14,
    },
    time: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 12,
    },
    content: {
        color: 'white',
        fontSize: 15,
        lineHeight: 20,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyState: {
        alignItems: 'center',
        marginTop: 60,
    },
    emptyText: {
        color: 'rgba(255,255,255,0.3)',
        marginTop: 15,
        textAlign: 'center',
    },
    inputBar: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        padding: 15,
        paddingBottom: Platform.OS === 'ios' ? 30 : 15,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
        backgroundColor: '#1C1C1E',
    },
    input: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingTop: 10,
        paddingBottom: 10,
        color: 'white',
        maxHeight: 100,
    },
    sendBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: Colors.cta.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
    },
    sendBtnDisabled: {
        backgroundColor: 'rgba(255,255,255,0.1)',
    }
});
