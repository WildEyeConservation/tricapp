import { DEVICE_IPS, NEW_IP } from '../actions/WifiActions';

interface ConnectionState {
  ips?: string[];
  ip?: string;
}

type ActionType = {
  type: typeof DEVICE_IPS | typeof NEW_IP;
  payload: ConnectionState;
}

const initialState = {
  ips: [],
};

export default (state = initialState, action: ActionType) => {
  switch (action.type) {
    case DEVICE_IPS:
      return {
        ...state,
        ips: action.payload.ips
      }     
    case NEW_IP:
      const newIpIdx = state.ips.findIndex(ip => ip === action.payload.ip);
      if (newIpIdx >= 0) {
        // exists
        return state;
      } else {
        // new
        return {
          ...state,
          ips: [...state.ips, action.payload.ip]
        }
      }
      return state
    default:
      return state;
  }
};
