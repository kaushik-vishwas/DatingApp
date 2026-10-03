import { useNavigation, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import React, { createContext, useContext, useMemo, useRef } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

const TRIGGER = 48;

type PagerEdges = { atStart: boolean; atEnd: boolean };

type LockApi = {
  acquire: () => void;
  release: () => void;
  setPagerEdges: (edges: PagerEdges | null) => void;
};

const TabSwipeLockContext = createContext<LockApi | null>(null);

/** Horizontal controls (inner pagers, chip rows) call this so they keep their own swipe. */
export function useSuppressMainTabSwipeHandlers(): {
  onTouchStart: () => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
} {
  const lock = useContext(TabSwipeLockContext);
  return {
    onTouchStart: () => lock?.acquire(),
    onTouchEnd: () => lock?.release(),
    onTouchCancel: () => lock?.release(),
  };
}

/**
 * Inner pager: keep its own swipe between pages. At the first page a right
 * swipe, and at the last page a left swipe, still moves the bottom tab.
 */
export function useMainTabSwipePagerGuard(atStart: boolean, atEnd: boolean): {
  onTouchStart: () => void;
  onTouchEnd: () => void;
  onTouchCancel: () => void;
} {
  const lock = useContext(TabSwipeLockContext);
  const edgesRef = useRef<PagerEdges>({ atStart, atEnd });
  edgesRef.current = { atStart, atEnd };
  return {
    onTouchStart: () => lock?.setPagerEdges(edgesRef.current),
    onTouchEnd: () => lock?.setPagerEdges(null),
    onTouchCancel: () => lock?.setPagerEdges(null),
  };
}

function shiftTab(navigation: NavigationProp<ParamListBase>, direction: 1 | -1): void {
  const state = navigation.getState();
  if (!state || state.type !== 'tab') return;
  const route = state.routes[state.index + direction];
  if (!route) return;
  navigation.navigate(route.name);
}

export function withBottomTabSwipe<P extends object>(
  Screen: React.ComponentType<P>
): React.ComponentType<P> {
  function SwipeableTabScreen(props: P): React.JSX.Element {
    const navigation = useNavigation<NavigationProp<ParamListBase>>();
    const lockCount = useRef(0);
    const pagerEdges = useRef<PagerEdges | null>(null);
    const lock = useMemo<LockApi>(
      () => ({
        acquire: () => {
          lockCount.current += 1;
        },
        release: () => {
          lockCount.current = Math.max(0, lockCount.current - 1);
        },
        setPagerEdges: (edges) => {
          pagerEdges.current = edges;
        },
      }),
      []
    );

    const pan = useMemo(
      () =>
        PanResponder.create({
          onMoveShouldSetPanResponderCapture: (_, g) => {
            if (lockCount.current > 0) return false;
            const horizontal = Math.abs(g.dx) > 26 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5;
            if (!horizontal) return false;
            const edges = pagerEdges.current;
            if (!edges) return true;
            if (g.dx > 0 && edges.atStart) return true;
            if (g.dx < 0 && edges.atEnd) return true;
            return false;
          },
          onPanResponderRelease: (_, g) => {
            if (lockCount.current > 0) return;
            if (g.dx <= -TRIGGER) shiftTab(navigation, 1);
            else if (g.dx >= TRIGGER) shiftTab(navigation, -1);
          },
          onPanResponderTerminationRequest: () => true,
        }),
      [navigation]
    );

    return (
      <TabSwipeLockContext.Provider value={lock}>
        <View style={styles.fill} {...pan.panHandlers}>
          <Screen {...props} />
        </View>
      </TabSwipeLockContext.Provider>
    );
  }

  SwipeableTabScreen.displayName = `withBottomTabSwipe(${Screen.displayName || Screen.name || 'Screen'})`;
  return SwipeableTabScreen;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
