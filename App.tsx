import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  Alert
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { Header } from './src/components/Header';
import { ConnectionModal } from './src/components/ConnectionModal';
import { ClipboardTab } from './src/components/ClipboardTab';
import { FilesTab } from './src/components/FilesTab';
import { NetworkTab } from './src/components/NetworkTab';

import {
  getServerUrl,
  getDeviceName,
  DEFAULT_SERVER_URL
} from './src/services/storage';
import {
  checkServerStatus,
  getClipboardHistory,
  getFilesList
} from './src/services/api';
import { TailShareWebSocket } from './src/services/websocket';
import { ClipboardItem, FileRecord, ServerStatus } from './src/types';

type TabKey = 'clipboard' | 'files' | 'network';

export default function App() {
  const [serverUrl, setServerUrl] = useState<string>(DEFAULT_SERVER_URL);
  const [deviceName, setDeviceName] = useState<string>('iPhone 11');
  const [activeTab, setActiveTab] = useState<TabKey>('clipboard');

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const [clipboardItems, setClipboardItems] = useState<ClipboardItem[]>([]);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);

  const [loadingClipboard, setLoadingClipboard] = useState<boolean>(false);
  const [loadingFiles, setLoadingFiles] = useState<boolean>(false);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(false);

  const wsRef = useRef<TailShareWebSocket | null>(null);

  // Initialize Settings
  useEffect(() => {
    (async () => {
      const savedUrl = await getServerUrl();
      const savedName = await getDeviceName();
      setServerUrl(savedUrl);
      setDeviceName(savedName);
    })();
  }, []);

  // Fetch all initial data
  const refreshAllData = async (targetUrl = serverUrl) => {
    if (!targetUrl) return;
    const start = Date.now();
    try {
      setLoadingStatus(true);
      const status = await checkServerStatus(targetUrl);
      setServerStatus(status);
      setIsConnected(true);
      setLatencyMs(Date.now() - start);
    } catch {
      setIsConnected(false);
      setLatencyMs(null);
    } finally {
      setLoadingStatus(false);
    }

    try {
      setLoadingClipboard(true);
      const history = await getClipboardHistory(targetUrl);
      setClipboardItems(history);
    } catch {
    } finally {
      setLoadingClipboard(false);
    }

    try {
      setLoadingFiles(true);
      const filesList = await getFilesList(targetUrl);
      setFiles(filesList);
    } catch {
    } finally {
      setLoadingFiles(false);
    }
  };

  // Re-connect WebSocket whenever serverUrl changes
  useEffect(() => {
    if (!serverUrl) return;

    if (wsRef.current) {
      wsRef.current.disconnect();
    }

    wsRef.current = new TailShareWebSocket(serverUrl, {
      onConnectionChange: (connected) => {
        setIsConnected(connected);
      },
      onClipboardUpdate: (item, history) => {
        setClipboardItems(history);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onClipboardHistory: (history) => {
        setClipboardItems(history);
      },
      onFilesUpdated: (allFiles) => {
        setFiles(allFiles);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
    });

    wsRef.current.connect();
    refreshAllData(serverUrl);

    // Heartbeat check every 25 seconds
    const interval = setInterval(() => {
      checkServerStatus(serverUrl)
        .then((s) => {
          setServerStatus(s);
          setIsConnected(true);
        })
        .catch(() => {
          setIsConnected(false);
        });
    }, 25000);

    return () => {
      clearInterval(interval);
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
    };
  }, [serverUrl]);

  const handleTabPress = (tab: TabKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  };

  const handleSaveConnection = (newUrl: string, newDeviceName: string) => {
    setServerUrl(newUrl);
    setDeviceName(newDeviceName);
    refreshAllData(newUrl);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top']}>
        <StatusBar style="dark" />

        {/* Top Header */}
        <Header
          serverUrl={serverUrl}
          isConnected={isConnected}
          latencyMs={latencyMs}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {/* Active Tab Screen */}
        <View style={styles.content}>
          {activeTab === 'clipboard' && (
            <ClipboardTab
              serverUrl={serverUrl}
              deviceName={deviceName}
              items={clipboardItems}
              isLoading={loadingClipboard}
              onRefresh={() => refreshAllData(serverUrl)}
              isConnected={isConnected}
            />
          )}

          {activeTab === 'files' && (
            <FilesTab
              serverUrl={serverUrl}
              deviceName={deviceName}
              files={files}
              isLoading={loadingFiles}
              onRefresh={() => refreshAllData(serverUrl)}
              isConnected={isConnected}
              storageDir={serverStatus?.storageDir}
            />
          )}

          {activeTab === 'network' && (
            <NetworkTab
              serverUrl={serverUrl}
              status={serverStatus}
              isLoading={loadingStatus}
              onRefresh={() => refreshAllData(serverUrl)}
              isConnected={isConnected}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          )}
        </View>

        {/* Bottom Tab Bar */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => handleTabPress('clipboard')}
            activeOpacity={0.7}
          >
            <View style={[styles.tabIconCircle, activeTab === 'clipboard' && styles.tabIconCircleActive]}>
              <Ionicons
                name={activeTab === 'clipboard' ? 'clipboard' : 'clipboard-outline'}
                size={22}
                color={activeTab === 'clipboard' ? '#0284C7' : '#64748B'}
              />
            </View>
            <Text style={[styles.tabLabel, activeTab === 'clipboard' && styles.tabLabelActive]}>
              Clipboard
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => handleTabPress('files')}
            activeOpacity={0.7}
          >
            <View style={[styles.tabIconCircle, activeTab === 'files' && styles.tabIconCircleActive]}>
              <Ionicons
                name={activeTab === 'files' ? 'folder' : 'folder-outline'}
                size={22}
                color={activeTab === 'files' ? '#0284C7' : '#64748B'}
              />
            </View>
            <Text style={[styles.tabLabel, activeTab === 'files' && styles.tabLabelActive]}>
              File & Foto
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.tabItem}
            onPress={() => handleTabPress('network')}
            activeOpacity={0.7}
          >
            <View style={[styles.tabIconCircle, activeTab === 'network' && styles.tabIconCircleActive]}>
              <Ionicons
                name={activeTab === 'network' ? 'wifi' : 'wifi-outline'}
                size={22}
                color={activeTab === 'network' ? '#0284C7' : '#64748B'}
              />
            </View>
            <Text style={[styles.tabLabel, activeTab === 'network' && styles.tabLabelActive]}>
              Tailscale
            </Text>
          </TouchableOpacity>
        </View>

        {/* Server Switcher Modal */}
        <ConnectionModal
          visible={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          currentUrl={serverUrl}
          deviceName={deviceName}
          onSave={handleSaveConnection}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    paddingTop: 8,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabIconCircle: {
    width: 36,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
  },
  tabIconCircleActive: {
    backgroundColor: '#E0F2FE',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  tabLabelActive: {
    color: '#0284C7',
    fontWeight: '700',
  },
});
