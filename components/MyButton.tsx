import React from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  Button
} from 'react-native';

type MyButtonProps = Button['props'];

const MyButton = (props: MyButtonProps) => {
  const { title, onPress, disabled } = props;

  return (
    <TouchableOpacity onPress={onPress} style={{ ...styles.button, backgroundColor: disabled ? 'grey': 'blue' }} disabled={disabled}>
      <Text style={styles.text}>{title}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    padding: 5,
    width: 100,
    alignItems: 'center',
    justifyContent: 'center'
  },
  text: {
    color: 'white'
  }
})

export default MyButton;