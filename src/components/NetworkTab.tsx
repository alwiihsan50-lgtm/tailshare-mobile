import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ServerStatus } from '../types';
import { checkServerStatus } from '../services/api';

interface NetworkTabProps {
  serverUrl: string;
  status: ServerStatus | null;
  isLoading: boolean;
  onRefresh: () => void;
  isConnected: boolean;
  onOpenSettings: () => void;
}

export const NetworkTab: React.FC<NetworkTabProps> = ({
  serverUrl,
  status,
  isLoading,
  onRefresh,
  isConnected,
  onOpenSettings,
}) => {
  const [testingPing, setTestingPing] = useState(false);
  const [pingResult, setPingResult] = useState<number | null>(null);

  const handleTestPing = async () => {
    try {
      setTestingPing(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const start = Date.now();
      await checkServerStatus(serverUrl);
      const elapsed = Date.now() - start;
      setPingResult(elapsed);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Ping Gagal', err.message);
    } finally {
      setTestingPing(false);
    }
  };

  const getDeviceIcon = (os: string) => {
    const lower = (os || '').toLowerCase();
    if (lower.includes('ios') || lower.includes('apple')) return 'phone-portrait-outline';
    if (lower.includes('android')) return 'phone-portrait-outline';
    if (lower.includes('windows')) return 'logo-windows';
    return 'desktop-outline';
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={onRefresh} tintColor="#0284C7" />
      }
    >
      {/* Node Status Card */}
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: isConnected ? '#ECFDF5' : '#FEF2F2' }
              ]}
            >
              <Ionicons
                name={isConnected ? 'checkmark-circle' : 'close-circle'}
                size={20}
                color={isConnected ? '#10B981' : '#EF4444'}
              />
            </View>
            <View>
              <Text style={styles.cardTitle}>Status Tailscale Node</Text>
              <Text style={styles.cardSubtitle}>
                {isConnected ? 'Terhubung secara aman' : 'Tidak terhubung'}
              </Text>
            </View>
          </View>

          <TouchableOpacity style={styles.pingBtn} onPress={handleTestPing} disabled={testingPing}>
            <Ionicons name="speedometer-outline" size={14} color="#0284C7" />
            <Text style={styles.pingBtnText}>
              {testingPing ? '...' : pingResult !== null ? `${pingResult}ms` : 'Ping'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.divider} />

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Host PC</Text>
          <Text style={styles.infoValue}>
            {status?.tailscale?.hostname || 'cuker-H610M-HVS-M-2-R2-0'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>IP Tailscale PC</Text>
          <Text style={[styles.infoValue, styles.monoText]}>
            {status?.tailscale?.ip || '100.110.205.27'}
          </Text>
        </View>

        {status?.tailscale?.dnsName && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>MagicDNS</Text>
            <Text style={[styles.infoValue, styles.monoText]} numberOfLines={1}>
              {status.tailscale.dnsName}
            </Text>
          </View>
        )}

        {status?.tailscale?.tailnet && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Akun Tailnet</Text>
            <Text style={styles.infoValue}>{status.tailscale.tailnet}</Text>
          </View>
        )}

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Folder Penyimpanan PC</Text>
          <Text style={[styles.infoValue, styles.monoText]} numberOfLines={1}>
            {status?.storageDir || '/media/cuker/Data/tailshare'}
          </Text>
        </View>
      </View>

      {/* Discovered Peers */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Perangkat Terdaftar di Tailnet</Text>
      </View>

      <View style={styles.card}>
        {(status?.tailscale?.peers || []).length > 0 ? (
          status?.tailscale?.peers?.map((peer, idx) => (
            <View key={peer.id || idx}>
              <View style={styles.peerRow}>
                <View style={styles.peerLeft}>
                  <View style={styles.peerIconBox}>
                    <Ionicons name={getDeviceIcon(peer.os)} size={18} color="#0284C7" />
                  </View>
                  <View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.peerName}>{peer.name}</Text>
                      {peer.name.toLowerCase().includes('ip11') && (
                        <View style={styles.thisDeviceBadge}>
                          <Text style={styles.thisDeviceText}>HP Ini</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.peerIp}>{peer.ip}</Text>
                  </View>
                </View>

                <View style={styles.peerStatus}>
                  <View
                    style={[
                      styles.peerDot,
                      { backgroundColor: peer.online ? '#10B981' : '#94A3B8' }
                    ]}
                  />
                  <Text
                    style={[
                      styles.peerStatusText,
                      { color: peer.online ? '#065F46' : '#94A3B8' }
                    ]}
                  >
                    {peer.online ? 'Online' : 'Offline'}
                  </Text>
                </View>
              </View>
              {idx < (status?.tailscale?.peers?.length || 0) - 1 && <View style={styles.innerDivider} />}
            </View>
          ))
        ) : (
          <View style={styles.peerRow}>
            <Text style={styles.emptyPeerText}>
              Tidak ada data peer dari server saat ini.
            </Text>
          </View>
        )}
      </View>

      {/* Server Switcher Card */}
      <TouchableOpacity style={styles.actionCard} onPress={onOpenSettings} activeOpacity={0.8}>
        <View style={styles.actionCardIcon}>
          <Ionicons name="settings-outline" size={20} color="#0284C7" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.actionCardTitle}>Ganti Alamat Server URL</Text>
          <Text style={styles.actionCardSub}>
            Pilih antara Direct Tailscale IP, MagicDNS, atau Cloudflare
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#94A3B8" />
      </TouchableOpacity>

      {/* About Box */}
      <View style={styles.aboutBox}>
        <Text style={styles.aboutTitle}>⚡ TailShare Mobile iOS Client</Text>
        <Text style={styles.aboutDesc}>
          Dibangun khusus untuk pemakaian pribadi tanpa ketergantungan lisensi Apple berbayar.
          Koneksi peer-to-peer terenkripsi WireGuard via Tailscale Mesh.
        </Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  pingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    gap: 4,
  },
  pingBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0284C7',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  innerDivider: {
    height: 1,
    backgroundColor: '#F8FAFC',
    marginVertical: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoLabel: {
    fontSize: 13,
    color: '#64748B',
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
    maxWidth: '60%',
    textAlign: 'right',
  },
  monoText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 12,
  },
  sectionHeader: {
    marginBottom: 8,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  peerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  peerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  peerIconBox: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  peerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  peerIp: {
    fontSize: 11,
    color: '#94A3B8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  thisDeviceBadge: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  thisDeviceText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284C7',
  },
  peerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  peerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  peerStatusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  emptyPeerText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 8,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
    marginBottom: 16,
  },
  actionCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  actionCardSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  aboutBox: {
    alignItems: 'center',
    padding: 16,
  },
  aboutTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
  },
  aboutDesc: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 16,
  },
});
