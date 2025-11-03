/**
 * Tick和价格转换工具函数
 * 使用Uniswap V3 SDK的TickMath
 */

import { TickMath } from "@uniswap/v3-sdk";
import JSBI from "jsbi";

const Q96 = 2n ** 96n;

/**
 * 从价格计算tick
 * 使用Uniswap V3 SDK
 */
export function priceToTick(price: number): number {
  const sqrtPrice = Math.sqrt(price);
  const sqrtPriceX96 = BigInt(Math.floor(sqrtPrice * Number(Q96)));
  return TickMath.getTickAtSqrtRatio(JSBI.BigInt(sqrtPriceX96.toString()));
}

/**
 * 从tick计算价格
 * price = 1.0001^tick
 */
export function tickToPrice(tick: number): number {
  return Math.pow(1.0001, tick);
}

/**
 * 从sqrtPriceX96计算tick
 * 使用Uniswap V3 SDK
 */
export function sqrtPriceX96ToTick(sqrtPriceX96: bigint): number {
  return TickMath.getTickAtSqrtRatio(JSBI.BigInt(sqrtPriceX96.toString()));
}

/**
 * 从tick计算sqrtPriceX96
 * 使用Uniswap V3 SDK
 */
export function tickToSqrtPriceX96(tick: number): bigint {
  const sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);
  return BigInt(sqrtPriceX96.toString());
}

