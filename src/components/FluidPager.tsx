import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { PanGestureHandler, State, type PanGestureHandlerStateChangeEvent } from 'react-native-gesture-handler';
import { pageSpring, prefersReducedMotion, subscribeReduceMotion } from '@/lib/motion';

type FluidPagerProps = {
  index: number;
  onIndexChange: (index: number) => void;
  children: React.ReactNode;
};

export function FluidPager({ index, onIndexChange, children }: FluidPagerProps) {
  const pages = React.Children.toArray(children).filter(Boolean);
  const count = pages.length;
  const [width, setWidth] = useState(0);
  const [heights, setHeights] = useState<number[]>([]);
  const [reduceMotion, setReduceMotion] = useState(prefersReducedMotion());
  const translateX = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const indexRef = useRef(index);
  const widthRef = useRef(width);

  useEffect(() => subscribeReduceMotion(setReduceMotion), []);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    widthRef.current = width;
  }, [width]);

  useEffect(() => {
    if (width <= 0) return;
    const to = -index * width;
    if (reduceMotion) {
      translateX.setValue(to);
      return;
    }
    Animated.spring(translateX, { ...pageSpring, toValue: to }).start();
  }, [index, width, reduceMotion, translateX]);

  const onHandlerStateChange = (event: PanGestureHandlerStateChangeEvent) => {
    if (event.nativeEvent.oldState !== State.ACTIVE) return;
    const pageWidth = widthRef.current;
    if (pageWidth <= 0 || reduceMotion) return;
    const { translationX, velocityX } = event.nativeEvent;
    let next = indexRef.current;
    if (translationX < -pageWidth * 0.22 || velocityX < -800) next = Math.min(count - 1, next + 1);
    if (translationX > pageWidth * 0.22 || velocityX > 800) next = Math.max(0, next - 1);
    const from = -indexRef.current * pageWidth + translationX;
    translateX.stopAnimation(() => {
      drag.setValue(0);
      translateX.setValue(from);
      if (next !== indexRef.current) onIndexChange(next);
      else Animated.spring(translateX, { ...pageSpring, toValue: -indexRef.current * pageWidth }).start();
    });
  };

  const travel = Animated.add(translateX, drag);

  return (
    <View
      style={styles.clip}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.width);
        if (next > 0 && next !== widthRef.current) setWidth(next);
      }}
    >
      <View style={{ height: heights[index] || undefined, overflow: 'hidden' }}>
        <PanGestureHandler
          enabled={!reduceMotion && count > 1}
          activeOffsetX={[-18, 18]}
          failOffsetY={[-14, 14]}
          onGestureEvent={Animated.event([{ nativeEvent: { translationX: drag } }], { useNativeDriver: true })}
          onHandlerStateChange={onHandlerStateChange}
        >
          <Animated.View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              width: width * Math.max(count, 1),
              transform: [{ translateX: travel }],
            }}
          >
            {pages.map((page, pageIndex) => (
              <View
                key={pageIndex}
                style={{ width: width || undefined }}
                onLayout={(event) => {
                  const next = Math.ceil(event.nativeEvent.layout.height);
                  setHeights((prev) => {
                    if (prev[pageIndex] === next) return prev;
                    const copy = prev.slice();
                    copy[pageIndex] = next;
                    return copy;
                  });
                }}
              >
                {page}
              </View>
            ))}
          </Animated.View>
        </PanGestureHandler>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
    alignSelf: 'stretch',
  },
});
