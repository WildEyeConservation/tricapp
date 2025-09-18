import { Alert } from 'react-native';

export default function confirm(
  title: string,
  message?: string,
  {
    confirmText = 'OK',
    cancelText = 'Cancel',
    destructive = false,
  }: { confirmText?: string; cancelText?: string; destructive?: boolean } = {}
): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmText,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      {
        cancelable: true,
        onDismiss: () => resolve(false),
      }
    );
  });
}