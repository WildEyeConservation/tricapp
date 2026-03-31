import { DEVICE_IPS, NEW_IP } from '../actions/WifiActions';

interface WifiState {
  ips: string[];
}

type ActionType = {
  type: typeof DEVICE_IPS | typeof NEW_IP;
  payload: {
    ips?: string[];
    ip?: string;
  };
};

const initialState: WifiState = {
  ips: [],
};

export default (state: WifiState = initialState, action: ActionType): WifiState => {
  switch (action.type) {
    case DEVICE_IPS:
      return {
        ...state,
        ips: action.payload.ips ?? state.ips
      };
    case NEW_IP:
      if (!action.payload.ip) return state;
      const newIpIdx = state.ips.findIndex(ip => ip === action.payload.ip);
      if (newIpIdx >= 0) {
        // exists
        return state;
      } else {
        // new
        return {
          ...state,
          ips: [...state.ips, action.payload.ip]
        };
      }
    default:
      return state;
  }
};
