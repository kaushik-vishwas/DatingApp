import React from 'react';
import { type NavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from './RootStackParamList';

export const navigationRef = React.createRef<NavigationContainerRef<RootStackParamList>>();

