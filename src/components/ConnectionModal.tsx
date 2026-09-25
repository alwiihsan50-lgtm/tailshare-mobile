import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { checkServerStatus } from '../services/api';
import { saveServerUrl, saveDeviceName, getRecentServers } from '../services/storage';

interface ConnectionModalProps {
  visible: boolean;
  onClose: () => void;
  currentUrl: string;
  deviceName: string;
  onSave: (newUrl: string, newDeviceName: string) => void;
}

export const ConnectionModal: React.FC<ConnectionModalProps> = ({
  visible,
  onClose,
  currentUrl,
  deviceName,
  onSave,
}) => {
  const [urlInput, setUrlInput] = useState(currentUrl);
  const [nameInput, setNameInput] = useState(deviceName);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    setUrlInput(currentUrl);
    setNameInput(deviceName);
    setTestResult(null);
    getRecentServers().then(setRecents);
  }, [visible, currentUrl, deviceName]);

  const handleTestConnection = async (targetUrl = urlInput) => {
    setTesting(true);
    setTestResult(null);
    const start = Date.now();
    try {
      const status = await checkServerStatus(targetUrl);
      const elapsed = Date.now() - start;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTestResult({
        ok: true,
        message: `Terhubung! (${elapsed}ms) - Host: ${status.tailscale?.hostname || 'TailShare Server'}`
      });
    } catch (err: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTestResult({
        ok: false,
        message: `Gagal: ${err.message || 'Tidak dapat menghubungi server'}`
      });
    } finally {
      setTesting(false);
    }
  };

  const handleApply = async () => {
    const cleanUrl = urlInput.trim().replace(/\/+$/, '');
    if (!cleanUrl) {
      Alert.alert('Error', 'URL Server tidak boleh kosong');
      return;
    }
    const cleanName = nameInput.trim() || 'iPhone';
    await saveServerUrl(cleanUrl);
    await saveDeviceName(cleanName);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(cleanUrl, cleanName);
    onClose();
  };

  const selectPreset = (presetUrl: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setUrlInput(presetUrl);
    handleTestConnection(presetUrl);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <View style={styles.sheetContainer}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Pengaturan Server</Text>
              <Text style={styles.sheetSubtitle}>Hubungkan ke TailShare backend di PC</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* Device Name Field */}
            <Text style={styles.fieldLabel}>Nama Perangkat Ini</Text>
            <View style={styles.inputBox}>
              <Ionicons name="phone-portrait-outline" size={18} color="#64748B" />
              <TextInput
                style={styles.textInput}
                value={nameInput}
                onChangeText={setNameInput}
                placeholder="Contoh: iPhone 11"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Server URL Field */}
            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>Alamat URL Server</Text>
            <View style={styles.inputBox}>
              <Ionicons name="globe-outline" size={18} color="#64748B" />
              <TextInput
                style={styles.textInput}
                value={urlInput}
                onChangeText={(val) => {
                  setUrlInput(val);
                  setTestResult(null);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="http://100.110.205.27:40506"
                placeholderTextColor="#94A3B8"
              />
            </View>

            {/* Test Connection Button */}
            <TouchableOpacity
              style={styles.testBtn}
              onPress={() => handleTestConnection()}
              disabled={testing}
            >
              {testing ? (
                <ActivityIndicator size="small" color="#0284C7" />
              ) : (
                <>
                  <Ionicons name="pulse" size={16} color="#0284C7" />
                  <Text style={styles.testBtnText}>Uji Koneksi</Text>
                </>
              )}
            </TouchableOpacity>

            {testResult && (
              <View
                style={[
                  styles.testResultBox,
                  testResult.ok ? styles.resultSuccess : styles.resultError
                ]}
              >
                <Ionicons
                  name={testResult.ok ? 'checkmark-circle' : 'alert-circle'}
                  size={18}
                  color={testResult.ok ? '#10B981' : '#EF4444'}
                />
                <Text
                  style={[
                    styles.resultText,
                    { color: testResult.ok ? '#065F46' : '#991B1B' }
                  ]}
                >
                  {testResult.message}
                </Text>
              </View>
            )}

            {/* Presets */}
            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Preset Rekomendasi (PC Anda)</Text>

            <TouchableOpacity
              style={[
                styles.presetCard,
                urlInput === 'http://100.110.205.27:40506' && styles.presetCardActive
              ]}
              onPress={() => selectPreset('http://100.110.205.27:40506')}
            >
              <View style={styles.presetIcon}>
                <Ionicons name="shield-checkmark" size={18} color="#0284C7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.presetTitle}>Direct Tailscale IP (Direkomendasikan)</Text>
                <Text style={styles.presetUrl}>http://100.110.205.27:40506</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.presetCard,
                urlInput === 'http://cuker-h610m-hvs-m-2-r2-0.tail474821.ts.net:40506' &&
                  styles.presetCardActive
              ]}
              onPress={() =>
                selectPreset('http://cuker-h610m-hvs-m-2-r2-0.tail474821.ts.net:40506')
              }
            >
              <View style={styles.presetIcon}>
                <Ionicons name="link" size={18} color="#6366F1" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.presetTitle}>Tailscale MagicDNS</Text>
                <Text style={styles.presetUrl}>cuker-h610m-hvs-m-2-r2-0.tail474821.ts.net</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.presetCard,
                urlInput === 'https://share.abbas.my.id' && styles.presetCardActive
              ]}
              onPress={() => selectPreset('https://share.abbas.my.id')}
            >
              <View style={styles.presetIcon}>
                <Ionicons name="cloud-outline" size={18} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.presetTitle}>Cloudflare Public Tunnel</Text>
                <Text style={styles.presetUrl}>https://share.abbas.my.id</Text>
              </View>
            </TouchableOpacity>

            <View style={{ height: 30 }} />
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelBtnText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.applyBtn} onPress={handleApply}>
              <Text style={styles.applyBtnText}>Simpan & Terapkan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  sheetSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingVertical: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 46,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    color: '#0F172A',
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    gap: 6,
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0284C7',
  },
  testResultBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
    gap: 8,
  },
  resultSuccess: {
    backgroundColor: '#ECFDF5',
  },
  resultError: {
    backgroundColor: '#FEF2F2',
  },
  resultText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    gap: 10,
  },
  presetCardActive: {
    borderColor: '#0284C7',
    backgroundColor: '#F0F9FF',
  },
  presetIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  presetUrl: {
    fontSize: 11,
    color: '#64748B',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },
  applyBtn: {
    flex: 2,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: '#0284C7',
    alignItems: 'center',
  },
  applyBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
