import React from 'react';
import {
  Text,
  TouchableOpacity,
  StyleSheet,
  Button
} from 'react-native';
import { theme } from '../theme';

interface IButtonAdd {
  width?: number;
}

type MyButtonProps = Button['props'] & IButtonAdd;

const MyButton = (props: MyButtonProps) => {
  const { title, onPress, disabled, width } = props;

  return (
    <TouchableOpacity onPress={onPress} style={{
      ...styles.button,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: disabled ? 'grey' : theme.primary,
      width: width ? width : styles.button.width
    }} disabled={disabled}>
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
    color: 'black'
  }
})

export default MyButton;