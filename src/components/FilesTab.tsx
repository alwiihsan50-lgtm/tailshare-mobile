import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  Alert,
  ActivityIndicator,
  Platform
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { FileRecord } from '../types';
import {
  uploadFileToPc,
  downloadAndShareFile,
  deleteFileFromPc
} from '../services/api';

interface FilesTabProps {
  serverUrl: string;
  deviceName: string;
  files: FileRecord[];
  isLoading: boolean;
  onRefresh: () => void;
  isConnected: boolean;
  storageDir?: string;
}

export const FilesTab: React.FC<FilesTabProps> = ({
  serverUrl,
  deviceName,
  files,
  isLoading,
  onRefresh,
  isConnected,
  storageDir,
}) => {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Pick & Upload Photos / Videos from iOS Camera Roll
  const handlePickMedia = async () => {
    if (!isConnected) {
      Alert.alert('Offline', 'Aplikasi belum terhubung ke server TailShare.');
      return;
    }

    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Izin Diperlukan', 'Izin akses galeri foto diperlukan untuk mengirim media.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images', 'videos'],
        allowsMultipleSelection: true,
        quality: 1,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      setUploading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        const fileName = asset.fileName || `media_${Date.now()}_${i}.${asset.type === 'video' ? 'mp4' : 'jpg'}`;
        setUploadStatus(`Mengunggah (${i + 1}/${result.assets.length}): ${fileName}`);

        await uploadFileToPc(
          serverUrl,
          asset.uri,
          fileName,
          asset.mimeType || (asset.type === 'video' ? 'video/mp4' : 'image/jpeg'),
          deviceName
        );
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Sukses', `${result.assets.length} file berhasil dikirim ke PC!`);
      onRefresh();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Gagal Mengunggah', err.message || 'Terjadi kesalahan saat mengunggah');
    } finally {
      setUploading(false);
      setUploadStatus(null);
    }
  };

  // Pick & Upload Documents from iOS Files
  const handlePickDocument = async () => {
    if (!isConnected) {
      Alert.alert('Offline', 'Aplikasi belum terhubung ke server TailShare.');
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      setUploading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        setUploadStatus(`Mengunggah (${i + 1}/${result.assets.length}): ${asset.name}`);

        await uploadFileToPc(
          serverUrl,
          asset.uri,
          asset.name,
          asset.mimeType || 'application/octet-stream',
          deviceName
        );
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Sukses', `${result.assets.length} dokumen berhasil dikirim ke PC!`);
      onRefresh();
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Gagal Mengunggah', err.message || 'Terjadi kesalahan saat mengunggah file');
    } finally {
      setUploading(false);
      setUploadStatus(null);
    }
  };

  // Download and share to iOS Files / Photos
  const handleDownloadFile = async (file: FileRecord) => {
    try {
      setDownloadingId(file.id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await downloadAndShareFile(serverUrl, file.id, file.originalName);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Gagal Mengunduh', err.message || 'Gagal mengunduh file dari PC');
    } finally {
      setDownloadingId(null);
    }
  };

  // Delete file from PC storage
  const handleDeleteFile = (file: FileRecord) => {
    Alert.alert(
      'Hapus File di PC',
      `Apakah Anda yakin ingin menghapus "${file.originalName}" dari penyimpanan PC?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              await deleteFileFromPc(serverUrl, file.id);
              onRefresh();
            } catch (err: any) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  };

  // File size formatter
  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Icon selector based on file extension
  const getFileIcon = (fileName: string, mimeType: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(ext) || mimeType.startsWith('image/')) {
      return { name: 'image-outline' as const, color: '#0284C7', bg: '#E0F2FE' };
    }
    if (['mp4', 'mov', 'mkv', 'avi'].includes(ext) || mimeType.startsWith('video/')) {
      return { name: 'videocam-outline' as const, color: '#8B5CF6', bg: '#EDE9FE' };
    }
    if (['pdf'].includes(ext)) {
      return { name: 'document-text-outline' as const, color: '#EF4444', bg: '#FEE2E2' };
    }
    if (['zip', 'rar', 'tar', 'gz', '7z'].includes(ext)) {
      return { name: 'archive-outline' as const, color: '#F59E0B', bg: '#FEF3C7' };
    }
    if (['mp3', 'wav', 'flac', 'm4a'].includes(ext) || mimeType.startsWith('audio/')) {
      return { name: 'musical-notes-outline' as const, color: '#EC4899', bg: '#FCE7F3' };
    }
    return { name: 'document-outline' as const, color: '#64748B', bg: '#F1F5F9' };
  };

  const renderFileCard = ({ item }: { item: FileRecord }) => {
    const iconConfig = getFileIcon(item.originalName, item.mimeType);
    const isDownloading = downloadingId === item.id;

    return (
      <View style={styles.fileCard}>
        <View style={[styles.fileIconBox, { backgroundColor: iconConfig.bg }]}>
          <Ionicons name={iconConfig.name} size={22} color={iconConfig.color} />
        </View>

        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>
            {item.originalName}
          </Text>
          <View style={styles.fileMetaRow}>
            <Text style={styles.fileSizeText}>{formatFileSize(item.size)}</Text>
            {item.senderDevice && (
              <>
                <Text style={styles.dotSeparator}>•</Text>
                <Text style={styles.fileSenderText} numberOfLines={1}>
                  {item.senderDevice}
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.fileActions}>
          <TouchableOpacity
            style={styles.downloadBtn}
            onPress={() => handleDownloadFile(item)}
            disabled={isDownloading}
          >
            {isDownloading ? (
              <ActivityIndicator size="small" color="#0284C7" />
            ) : (
              <Ionicons name="cloud-download-outline" size={18} color="#0284C7" />
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteFile(item)}>
            <Ionicons name="trash-outline" size={16} color="#94A3B8" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Upload Action Hub */}
      <View style={styles.actionHub}>
        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}
          onPress={handlePickMedia}
          disabled={uploading}
          activeOpacity={0.8}
        >
          <View style={[styles.actionCircle, { backgroundColor: '#E0F2FE' }]}>
            <Ionicons name="images" size={20} color="#0284C7" />
          </View>
          <View>
            <Text style={styles.actionCardTitle}>Kirim Foto / Video</Text>
            <Text style={styles.actionCardSub}>Pilih dari Galeri iPhone</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionCard, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}
          onPress={handlePickDocument}
          disabled={uploading}
          activeOpacity={0.8}
        >
          <View style={[styles.actionCircle, { backgroundColor: '#EDE9FE' }]}>
            <Ionicons name="folder-open" size={20} color="#7C3AED" />
          </View>
          <View>
            <Text style={styles.actionCardTitle}>Kirim Dokumen</Text>
            <Text style={styles.actionCardSub}>Pilih dari File iPhone</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Upload Progress Status */}
      {uploading && (
        <View style={styles.uploadProgressBox}>
          <ActivityIndicator size="small" color="#0284C7" />
          <Text style={styles.uploadProgressText} numberOfLines={1}>
            {uploadStatus || 'Sedang mengunggah...'}
          </Text>
        </View>
      )}

      {/* Storage Folder Info */}
      <View style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>File di Penyimpanan PC</Text>
          {storageDir && (
            <Text style={styles.storageDirText} numberOfLines={1}>
              Folder: {storageDir}
            </Text>
          )}
        </View>
        <Text style={styles.countBadge}>{files.length} file</Text>
      </View>

      {/* Files List */}
      <FlatList
        data={files}
        keyExtractor={(item) => item.id}
        renderItem={renderFileCard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="#0284C7" />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="folder-open-outline" size={48} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>Belum ada file di server</Text>
            <Text style={styles.emptySubtitle}>
              Kirim foto, video, atau dokumen dari tombol di atas untuk langsung menyimpannya ke PC
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
  actionHub: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
    gap: 12,
  },
  actionCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  actionCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  actionCardSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  uploadProgressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    marginHorizontal: 16,
    marginVertical: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 10,
  },
  uploadProgressText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0369A1',
    flex: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  storageDirText: {
    fontSize: 11,
    color: '#94A3B8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  countBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    paddingTop: 4,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  fileIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 3,
  },
  fileMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileSizeText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  dotSeparator: {
    fontSize: 12,
    color: '#CBD5E1',
    marginHorizontal: 6,
  },
  fileSenderText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  fileActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  downloadBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
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
