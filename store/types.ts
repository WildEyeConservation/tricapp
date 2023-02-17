import { createStore, combineReducers, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';

import BtReducer from './reducers/BtReducer';
import WifiReducer from './reducers/WifiReducer';

const rootReducer = combineReducers({
  bt: BtReducer,
  wifi: WifiReducer
});

export type RootState = ReturnType<typeof rootReducer>;

export const store = createStore(rootReducer, applyMiddleware(thunk));