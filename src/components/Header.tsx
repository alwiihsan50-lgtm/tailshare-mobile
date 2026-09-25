import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface HeaderProps {
  serverUrl: string;
  isConnected: boolean;
  onOpenSettings: () => void;
  latencyMs?: number | null;
}

export const Header: React.FC<HeaderProps> = ({
  serverUrl,
  isConnected,
  onOpenSettings,
  latencyMs
}) => {
  const getDisplayUrl = (url: string) => {
    try {
      const u = new URL(url);
      return u.hostname + (u.port ? `:${u.port}` : '');
    } catch {
      return url.replace(/^https?:\/\//, '');
    }
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onOpenSettings();
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <View style={styles.logoGroup}>
          <View style={styles.iconCircle}>
            <Ionicons name="flash" size={18} color="#0284C7" />
          </View>
          <View>
            <Text style={styles.title}>TailShare</Text>
            <Text style={styles.subtitle}>iOS Sync Client</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.statusPill, isConnected ? styles.connectedPill : styles.disconnectedPill]}
          onPress={handlePress}
          activeOpacity={0.7}
        >
          <View
            style={[styles.statusDot, { backgroundColor: isConnected ? '#10B981' : '#EF4444' }]}
          />
          <Text
            style={[styles.statusText, { color: isConnected ? '#065F46' : '#991B1B' }]}
            numberOfLines={1}
          >
            {isConnected ? (latencyMs ? `${latencyMs}ms` : 'Connected') : 'Offline'}
          </Text>
          <Ionicons
            name="chevron-down"
            size={12}
            color={isConnected ? '#065F46' : '#991B1B'}
            style={{ marginLeft: 3 }}
          />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.serverBar} onPress={handlePress} activeOpacity={0.8}>
        <Ionicons name="server-outline" size={14} color="#64748B" />
        <Text style={styles.serverUrlText} numberOfLines={1}>
          {getDisplayUrl(serverUrl)}
        </Text>
        <Text style={styles.changeBadge}>Ubah</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 12 : 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  connectedPill: {
    backgroundColor: '#D1FAE5',
  },
  disconnectedPill: {
    backgroundColor: '#FEE2E2',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  serverBar: {
    marginTop: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  serverUrlText: {
    flex: 1,
    fontSize: 12,
    color: '#475569',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  changeBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0284C7',
  },
});
