// IPv4Prompt.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import MyButton from '../components/MyButton';

type Props = {
  visible: boolean;
  initialValue?: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (ip: string) => void;
  onCancel: () => void;
};

const IPV4_REGEX =
  /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

export default function IPv4Prompt({
  visible,
  initialValue = "",
  title = "Enter IPv4 address",
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
}: Props) {
  const [text, setText] = useState(initialValue);

  useEffect(() => {
    if (visible) setText(initialValue);
  }, [visible, initialValue]);

  const cleaned = useMemo(
    () => text.replace(/[^\d.]/g, ""), // keep digits and dots only
    [text]
  );

  const isValid = useMemo(() => IPV4_REGEX.test(cleaned), [cleaned]);

  const handleConfirm = () => {
    if (isValid) onConfirm(cleaned);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.center}
      >
        <View style={styles.backdrop} />

        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>

          <TextInput
            value={cleaned}
            onChangeText={setText}
            placeholder="e.g. 192.168.0.10"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={Platform.select({
              ios: "numbers-and-punctuation",
              android: "number-pad",
              default: "default",
            })}
            returnKeyType="done"
            onSubmitEditing={handleConfirm}
            autoFocus
            maxLength={15} // "255.255.255.255"
            style={[
              styles.input,
              cleaned.length > 0 && (isValid ? styles.ok : styles.err),
            ]}
          />

          {cleaned.length > 0 && !isValid && (
            <Text style={styles.errorText}>Invalid IPv4 address</Text>
          )}

          <View style={styles.row}>
            <MyButton title={cancelText} onPress={onCancel}></MyButton>
            <View style={{ width: 5 }}></View>
            <MyButton title={confirmText} onPress={handleConfirm} disabled={!isValid}></MyButton>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  card: {
    width: "90%",
    maxWidth: 420,
    backgroundColor: "white",
    borderRadius: 16,
    padding: 18,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  title: { fontSize: 18, fontWeight: "600", marginBottom: 10, color: 'black' },
  input: {
    borderWidth: 1.5,
    borderColor: "#cfcfcf",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  ok: { borderColor: "#3fb950" },
  err: { borderColor: "#ff5a5f" },
  errorText: { marginTop: 6, color: "#ff5a5f" },
  row: {
    marginTop: 16,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  btnSecondary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d0d7de",
  },
  btnSecondaryText: { fontSize: 16 },
  btnPrimary: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#0a84ff",
  },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryText: { fontSize: 16, color: "white", fontWeight: "600" },
});
