import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type AppDialogButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type DialogRequest = {
  id: number;
  title: string;
  message?: string;
  buttons: AppDialogButton[];
};

let nextId = 1;
let queue: DialogRequest[] = [];
const listeners = new Set<(q: DialogRequest[]) => void>();

function emit(): void {
  listeners.forEach((l) => l(queue));
}

/** Drop-in replacement for `Alert.alert(title, message, buttons)` with the app's popup style. */
export function appAlert(title: string, message?: string, buttons?: AppDialogButton[]): void {
  queue = [
    ...queue,
    { id: nextId++, title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] },
  ];
  emit();
}

/** Mount once near the app root. */
export function AppDialogHost(): React.JSX.Element | null {
  const [items, setItems] = useState<DialogRequest[]>(queue);

  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  const current = items[0];
  if (!current) return null;

  const close = (button?: AppDialogButton): void => {
    queue = queue.filter((d) => d.id !== current.id);
    emit();
    button?.onPress?.();
  };

  const cancelButton = current.buttons.find((b) => b.style === 'cancel');
  const destructive = current.buttons.some((b) => b.style === 'destructive');

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(cancelButton)}>
      <Pressable style={styles.backdrop} onPress={cancelButton ? () => close(cancelButton) : undefined}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={[styles.iconWrap, destructive ? styles.iconDanger : styles.iconInfo]}>
            <Ionicons
              name={destructive ? 'log-out-outline' : 'information-circle-outline'}
              size={28}
              color={destructive ? '#dc2626' : '#6d28d9'}
            />
          </View>
          <Text style={styles.title}>{current.title}</Text>
          {current.message ? <Text style={styles.body}>{current.message}</Text> : null}
          <View style={styles.buttons}>
            {current.buttons.map((b, i) =>
              b.style === 'cancel' ? (
                <TouchableOpacity key={`${b.text}-${i}`} style={styles.cancelBtn} onPress={() => close(b)}>
                  <Text style={styles.cancelText}>{b.text}</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  key={`${b.text}-${i}`}
                  style={[styles.primaryBtn, b.style === 'destructive' && styles.dangerBtn]}
                  onPress={() => close(b)}
                  activeOpacity={0.9}
                >
                  <Text style={styles.primaryText}>{b.text}</Text>
                </TouchableOpacity>
              )
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 0, 20, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 18,
    alignItems: 'center',
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  iconInfo: { backgroundColor: '#f3e8ff' },
  iconDanger: { backgroundColor: '#fee2e2' },
  title: { fontSize: 19, fontWeight: '700', color: '#1a1025', marginBottom: 6, textAlign: 'center' },
  body: {
    fontSize: 15,
    lineHeight: 21,
    color: '#5b5366',
    textAlign: 'center',
    marginBottom: 4,
  },
  buttons: { alignSelf: 'stretch', marginTop: 16, gap: 8 },
  primaryBtn: {
    backgroundColor: '#6d28d9',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  dangerBtn: { backgroundColor: '#dc2626' },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { paddingVertical: 10, alignItems: 'center' },
  cancelText: { color: '#6b7280', fontSize: 15, fontWeight: '600' },
});
