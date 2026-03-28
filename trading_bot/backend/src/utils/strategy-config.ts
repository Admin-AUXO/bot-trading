import { config } from '../config/index.js';
import type { Strategy } from './types.js';

export function getStopLossPercent(strategy: Strategy): number {
  switch (strategy) {
    case 'S1_COPY': return config.strategies.s1.stopLossPercent;
    case 'S2_GRADUATION': return config.strategies.s2.stopLossPercent;
    case 'S3_MOMENTUM': return config.strategies.s3.stopLossPercent;
  }
}

export function getMaxSlippageBps(strategy: Strategy): number {
  switch (strategy) {
    case 'S1_COPY': return config.strategies.s1.maxSlippageBps;
    case 'S2_GRADUATION': return config.strategies.s2.maxSlippageBps;
    case 'S3_MOMENTUM': return config.strategies.s3.maxSlippageBps;
    default: return 500;
  }
}

export function getTimeLimitMinutes(strategy: Strategy): number {
  switch (strategy) {
    case 'S1_COPY': return config.strategies.s1.timeStopMinutes;
    case 'S2_GRADUATION': return config.strategies.s2.timeLimitMinutes;
    case 'S3_MOMENTUM': return config.strategies.s3.timeLimitMinutes;
  }
}

export function getTimeStopMinutes(strategy: Strategy): number {
  switch (strategy) {
    case 'S1_COPY': return config.strategies.s1.timeStopMinutes;
    case 'S2_GRADUATION': return config.strategies.s2.timeStopMinutes;
    case 'S3_MOMENTUM': return config.strategies.s3.timeStopMinutes;
  }
}
