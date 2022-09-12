import { createStore, combineReducers, applyMiddleware } from 'redux';
import thunk from 'redux-thunk';

import BtReducer from './reducers/BtReducer';

const rootReducer = combineReducers({
  bt: BtReducer
});

export type RootState = ReturnType<typeof rootReducer>;

export const store = createStore(rootReducer, applyMiddleware(thunk));