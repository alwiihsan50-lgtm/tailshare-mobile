import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  Linking,
  ActivityIndicator,
  Share,
  Platform
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { ClipboardItem } from '../types';
import {
  sendClipboardToPc,
  togglePinClipboard,
  deleteClipboardItem
} from '../services/api';

interface ClipboardTabProps {
  serverUrl: string;
  deviceName: string;
  items: ClipboardItem[];
  isLoading: boolean;
  onRefresh: () => void;
  isConnected: boolean;
}

export const ClipboardTab: React.FC<ClipboardTabProps> = ({
  serverUrl,
  deviceName,
  items,
  isLoading,
  onRefresh,
  isConnected,
}) => {
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sending, setSending] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2500);
  };

  // Instant Push: Read iPhone Clipboard and send to PC
  const handleQuickSendDeviceClipboard = async () => {
    if (!isConnected) {
      Alert.alert('Offline', 'Aplikasi belum terhubung ke server TailShare.');
      return;
    }
    try {
      setSending(true);
      const text = await Clipboard.getStringAsync();
      if (!text || !text.trim()) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert('Clipboard Kosong', 'Tidak ada teks di clipboard iPhone Anda saat ini.');
        return;
      }

      await sendClipboardToPc(serverUrl, text.trim(), deviceName, true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('⚡ Clipboard berhasil dikirim ke PC!');
      onRefresh();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Gagal Mengirim', err.message || 'Gagal mengirim clipboard ke PC');
    } finally {
      setSending(false);
    }
  };

  // Send typed/manual text to PC
  const handleSendManualText = async () => {
    if (!inputText.trim()) return;
    if (!isConnected) {
      Alert.alert('Offline', 'Aplikasi belum terhubung ke server TailShare.');
      return;
    }
    try {
      setSending(true);
      await sendClipboardToPc(serverUrl, inputText.trim(), deviceName, true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setInputText('');
      showToast('✓ Teks terkirim ke PC!');
      onRefresh();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Gagal', err.message || 'Gagal mengirim teks');
    } finally {
      setSending(false);
    }
  };

  // Copy history item into iPhone clipboard
  const handleCopyToIPhone = async (text: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    showToast('📋 Tersalin ke clipboard iPhone!');
  };

  // Pin item
  const handleTogglePin = async (id: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await togglePinClipboard(serverUrl, id);
      onRefresh();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  // Delete item
  const handleDeleteItem = async (id: string) => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      await deleteClipboardItem(serverUrl, id);
      onRefresh();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  // Format relative timestamp
  const formatTime = (ts: number) => {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return 'Baru saja';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} mnt lalu`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} jam lalu`;
    return new Date(ts).toLocaleDateString();
  };

  // Check if string is a URL
  const isUrl = (str: string) => {
    return /^https?:\/\//i.test(str.trim());
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    return item.text.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const renderItem = ({ item }: { item: ClipboardItem }) => {
    const isLink = isUrl(item.text);

    return (
      <View style={[styles.card, item.pinned && styles.pinnedCard]}>
        <View style={styles.cardHeader}>
          <View style={styles.sourceGroup}>
            <View
              style={[
                styles.sourceBadge,
                item.source?.includes('PC') ? styles.pcBadge : styles.mobileBadge
              ]}
            >
              <Ionicons
                name={item.source?.includes('PC') ? 'desktop-outline' : 'phone-portrait-outline'}
                size={12}
                color={item.source?.includes('PC') ? '#1E40AF' : '#047857'}
              />
              <Text
                style={[
                  styles.sourceText,
                  { color: item.source?.includes('PC') ? '#1E40AF' : '#047857' }
                ]}
              >
                {item.source || 'Device'}
              </Text>
            </View>
            <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => handleTogglePin(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons
                name={item.pinned ? 'star' : 'star-outline'}
                size={18}
                color={item.pinned ? '#F59E0B' : '#94A3B8'}
              />
            </TouchableOpacity>

            <TouchableOpacity onPress={() => handleDeleteItem(item.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={17} color="#94A3B8" />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.cardText} selectable={true}>
          {item.text}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={styles.charCountText}>{item.text.length} karakter</Text>

          <View style={styles.actionButtonsRow}>
            {isLink && (
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => Linking.openURL(item.text.trim())}
              >
                <Ionicons name="open-outline" size={14} color="#0284C7" />
                <Text style={styles.linkBtnText}>Buka Link</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.copyBtn}
              onPress={() => handleCopyToIPhone(item.text)}
            >
              <Ionicons name="copy-outline" size={14} color="#0F172A" />
              <Text style={styles.copyBtnText}>Salin ke iPhone</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {toastMessage && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      )}

      {/* Hero Quick Push Button */}
      <View style={styles.heroBox}>
        <TouchableOpacity
          style={[styles.heroBtn, sending && styles.disabledBtn]}
          onPress={handleQuickSendDeviceClipboard}
          disabled={sending}
          activeOpacity={0.8}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <Ionicons name="send" size={18} color="#FFFFFF" />
              <Text style={styles.heroBtnText}>Kirim Clipboard iPhone ke PC</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.heroSubtext}>
          1 ketuk untuk langsung menyalin clipboard iPhone Anda ke sistem PC Linux
        </Text>
      </View>

      {/* Manual Input Scratchpad */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.manualInput}
          placeholder="Atau ketik/paste teks manual untuk dikirim..."
          placeholderTextColor="#94A3B8"
          value={inputText}
          onChangeText={setInputText}
          multiline={true}
          numberOfLines={3}
        />
        {inputText.length > 0 && (
          <TouchableOpacity
            style={styles.sendManualBtn}
            onPress={handleSendManualText}
            disabled={sending}
          >
            <Ionicons name="paper-plane" size={15} color="#0284C7" />
            <Text style={styles.sendManualText}>Kirim Teks</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Search Bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={16} color="#94A3B8" />
        <TextInput
          style={styles.searchInput}
          placeholder="Cari riwayat clipboard..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={16} color="#94A3B8" />
          </TouchableOpacity>
        )}
      </View>

      {/* History List */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="#0284C7" />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="clipboard-outline" size={48} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>Belum ada riwayat clipboard</Text>
            <Text style={styles.emptySubtitle}>
              Salin sesuatu di PC Anda atau kirim dari iPhone untuk memulai sinkronisasi
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  toast: {
    position: 'absolute',
    top: 10,
    alignSelf: 'center',
    backgroundColor: '#0F172A',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  heroBox: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  heroBtn: {
    backgroundColor: '#0284C7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledBtn: {
    opacity: 0.7,
  },
  heroBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  heroSubtext: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
  },
  inputContainer: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
  },
  manualInput: {
    fontSize: 13,
    color: '#0F172A',
    minHeight: 48,
    textAlignVertical: 'top',
  },
  sendManualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 6,
    marginTop: 4,
  },
  sendManualText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0284C7',
  },
  searchBar: {
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 6,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  pinnedCard: {
    borderColor: '#FDE68A',
    backgroundColor: '#FFFDF5',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sourceGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  pcBadge: {
    backgroundColor: '#DBEAFE',
  },
  mobileBadge: {
    backgroundColor: '#D1FAE5',
  },
  sourceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  timeText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardText: {
    fontSize: 14,
    color: '#1E293B',
    lineHeight: 20,
    marginBottom: 10,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  charCountText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F0F9FF',
  },
  linkBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0284C7',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  copyBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 30,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});
