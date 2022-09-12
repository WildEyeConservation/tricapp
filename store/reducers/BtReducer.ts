import { CONNECTION_STATE, DEVICE_IP, RESPONSE, WIFI_SETUP_DONE } from '../actions/BtActions';
import { Buffer } from "buffer";

interface ConnectionState {
  enabled?: boolean;
  connected?: boolean;
  ip?: string;
  noResponse?: boolean;
  wifiDone?: boolean
}

type ActionType = {
  type: typeof CONNECTION_STATE | typeof DEVICE_IP | typeof RESPONSE | typeof WIFI_SETUP_DONE;
  payload: ConnectionState;
}

const initialState = {
  enabled: false,
  connected: false,
  ip: '',
  noResponse: false,
  wifiDone: false
};

export default (state = initialState, action: ActionType) => {
  switch (action.type) {
    case CONNECTION_STATE:
      const newEnabled = action.payload.enabled !== undefined ? action.payload.enabled : state.enabled;
      const newConnected = action.payload.connected !== undefined ? action.payload.connected : state.connected;
      return {
        ...state,
        enabled: newEnabled,
        connected: newConnected
      }
    case DEVICE_IP:
      return {
        ...state,
        ip: action.payload.ip,
      }
    case RESPONSE:
      return {
        ...state,
        noResponse: action.payload.noResponse,
      }
    case WIFI_SETUP_DONE:
      return {
        ...state,
        wifiDone: !state.wifiDone, // not -> force update
      }
    default:
      return state;
  }
};
