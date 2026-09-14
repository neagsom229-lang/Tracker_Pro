import { useEffect, useRef, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { getCurrency } from '../utils/constants';

/**
 * AnimatedCounter
 * Smoothly tweens the displayed number whenever `value` changes, rather
 * than snapping instantly — this is what gives the balance card its
 * "luxurious" feel when a new transaction is added.
 */
export default function AnimatedCounter({ value, currencyCode = 'USD', className = '' }) {
  const currency = getCurrency(currencyCode);
  const decimals = currency.code === 'KHR' || currency.code === 'JPY' ? 0 : 2;
  const converted = value * currency.rate;

  const spring = useSpring(converted, { stiffness: 120, damping: 20, mass: 0.6 });
  const [display, setDisplay] = useState(converted);
  const hasMounted = useRef(false);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      spring.set(converted);
      setDisplay(converted);
      return;
    }
    spring.set(converted);
  }, [converted]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const unsubscribe = spring.on('change', (v) => setDisplay(v));
    return unsubscribe;
  }, [spring]);

  const formatted = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={className}>
      {currency.symbol}
      {formatted}
    </span>
  );
}
