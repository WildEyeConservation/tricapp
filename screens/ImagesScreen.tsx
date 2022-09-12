import React, { useState, useEffect } from 'react';
import {
  Button,
  View,
  Text,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Dimensions,
  Image,
  FlatList,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';

import { ImagesProps } from '../navigation/types';
import Icon from 'react-native-vector-icons/MaterialIcons';
import ReactNativeZoomableView from '@dudigital/react-native-zoomable-view/src/ReactNativeZoomableView';
import MyButton from '../components/MyButton';
import { RootState } from '../store/types';
import Toast from 'react-native-simple-toast';

const windowWidth = Dimensions.get('window').width;
const windowHeight = Dimensions.get('window').height - 120;

interface IApiCamera {
  serialNumber: string;
  image: string;
  aspectRatio: number
}

interface IImage {
  url: string;
  idx: number;
}

const renderImages = (aspectRatio: number, onSelect: (idx: number | undefined) => void, { item }: { item: IImage }) => {
  return (
    <View style={styles.window}>
      <ScrollView horizontal>
        <TouchableOpacity activeOpacity={1.0} onPress={() => onSelect(item.idx)}>
          <Image
            style={{ ...styles.image, aspectRatio: aspectRatio }}
            source={{
              uri: `data:image/jpg;base64,${item.url}`,
            }}
          />
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const ImagesScreen = ({ route, navigation }: ImagesProps) => {
  const [image, setImage] = useState<IImage | undefined>(undefined);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [serialNumber, setSerialNumber] = useState('');
  const [imLoading, setImLoading] = useState(true);
  const [currentCamIdx, setCurrentCamIdx] = useState(0);
  const [currentImIdx, setCurrentImIdx] = useState(0);

  const ip = useSelector((state: RootState) => state.bt.ip);

  useEffect(() => {
    getImage(0, 0);
  }, []);

  useEffect(() => {
    if (serialNumber !== '') {
      navigation.setOptions({
        headerTitle: `Images, SN: ${serialNumber}`,
      });
    }
  }, [serialNumber])

  const getImage = (camIdx: number, imIdx: number) => {
    setImLoading(true);
    setImage(undefined);
    fetch(`http://${ip}:5000/api/image/${camIdx}/${imIdx}`).then(res => {
      if (res.status >= 400 && res.status < 600) {
        throw new Error("Bad response from server");
      }
      return res.json();
    })
      .then((res: IApiCamera) => {
        console.log(res.serialNumber);
        setImLoading(false);
        if (res.image === '') {
          Toast.show('Empty image', Toast.SHORT); 
        } else {
          const rxImgs: IImage = {
            url: res.image,
            idx: imIdx
          };
          setImage(rxImgs);
          setAspectRatio(res.aspectRatio);
        }        
        setSerialNumber(res.serialNumber);
      })
      .catch((err) => {
        console.log(err);
        setImLoading(false);
        Toast.show(err.toString(), Toast.SHORT);
      })
  }

  if (image === undefined || imLoading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.normal}>
          {imLoading ? (
            <View>
              <Text style={styles.textNormal}>This may take a few seconds</Text>
              <ActivityIndicator size="small" color='black' />
            </View>
          ) : (
            <View style={styles.normal}>
              <Text style={styles.textNormal}>Loading image failed</Text>
              <TouchableOpacity onPress={() => getImage(0, 0)}>
                <Icon name='refresh' size={30} color='black' />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.screen}>
        {/* <Modal visible={true} transparent={true}>
            <ImageViewer style={{width: 200, height: 200}} imageUrls={image} />
          </Modal> */}
        <View style={styles.normal}>
          <Text style={styles.textBold}>Camera: {serialNumber} Image: {currentImIdx+1}/3</Text>
          <ReactNativeZoomableView
            maxZoom={3.0}
            minZoom={1.0}
            zoomStep={0.0}
            initialZoom={1.0}
            bindToBorders={true}
            style={styles.normal}
          >
            <Image
              style={{ ...styles.zoomableImage, aspectRatio: aspectRatio }}
              source={{
                uri: `data:image/jpg;base64,${image.url}`,
              }}
            />
          </ReactNativeZoomableView>
          <View style={styles.buttonContainer}>
            {/* <View style={{ marginHorizontal: 10 }}></View> */}
            {/* <Icon name='refresh' size={30} onPress={() => getImage(currentCamIdx)} /> */}
            <View style={{ marginHorizontal: 10 }}></View>
            <MyButton
              title='Next image'
              onPress={() => {
                const nexImIdx = (currentImIdx + 1) % 3;
                getImage(currentCamIdx, nexImIdx);
                setCurrentImIdx(nexImIdx);
              }}
            ></MyButton>
            <View style={{padding: 5}}></View>
            <MyButton
              title='Next camera'
              onPress={() => {
                const nexCamIdx = (currentCamIdx + 1) % 3;
                getImage(nexCamIdx, 0);
                setCurrentCamIdx(nexCamIdx);
                setCurrentImIdx(0);
              }}
            ></MyButton>
            <View style={{ marginHorizontal: 3 }}></View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  window: {
    width: windowWidth,
    height: windowHeight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 10
  },
  image: {
    height: windowHeight,
    resizeMode: 'contain',
  },
  normal: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonContainer: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 5,
  },
  zoomable: {
    flex: 1,
    width: windowWidth,
    // height: windowHeight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomableImage: {
    width: windowWidth,
    resizeMode: 'contain',
  },
  textNormal: {
    color: 'black'
  },
  textBold: {
    color: 'black',
    fontWeight: 'bold'
  }
  // footer: {
  //   flexDirection: 'row',
  //   width: windowWidth,
  //   alignItems: 'center',
  //   justifyContent: 'space-between',
  //   padding: 5
  // }
});

export default ImagesScreen;