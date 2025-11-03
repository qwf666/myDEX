import { formatUnits, parseUnits } from "viem";
import { TickMath } from "@uniswap/v3-sdk";
import { priceToTick } from "./tick";
import JSBI from "jsbi";

/**
 * 格式化代币数量
 */
export function formatTokenAmount(amount: bigint | string, decimals: number = 18): string {
  try {
    const amountBigInt = typeof amount === "string" ? BigInt(amount) : amount;
    return formatUnits(amountBigInt, decimals);
  } catch {
    return "0";
  }
}

/**
 * 解析代币数量字符串为BigInt
 */
export function parseTokenAmount(amount: string, decimals: number = 18): bigint {
  try {
    return parseUnits(amount, decimals);
  } catch {
    return 0n;
  }
}

/**
 * 格式化地址显示（前6后4）
 */
export function formatAddress(address: string | undefined | null): string {
  if (!address) return "";
  if (address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * 格式化价格（从sqrtPriceX96计算）
 * price = (sqrtPriceX96 / 2^96)^2
 */
export function formatPriceFromSqrtX96(sqrtPriceX96: bigint, token0Decimals: number = 18, token1Decimals: number = 18): string {
  try {
    // sqrtPriceX96是Q96格式，需要除以2^96得到实际sqrtPrice
    const Q96 = 2n ** 96n;
    const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
    const price = sqrtPrice * sqrtPrice;
    
    // 考虑代币精度差异
    const decimalsAdjust = 10n ** BigInt(Math.abs(token0Decimals - token1Decimals));
    const adjustedPrice = price * Number(decimalsAdjust);
    
    return adjustedPrice.toFixed(6);
  } catch {
    return "0";
  }
}

/**
 * 从价格计算sqrtPriceX96
 * 使用Uniswap V3 SDK
 */
export function priceToSqrtX96(price: number): bigint {
  const tick = priceToTick(price);
  const sqrtPriceX96 = TickMath.getSqrtRatioAtTick(tick);
  return BigInt(sqrtPriceX96.toString());
}

/**
 * 格式化百分比
 */
export function formatPercent(value: number | bigint, decimals: number = 2): string {
  const num = typeof value === "bigint" ? Number(value) : value;
  return `${num.toFixed(decimals)}%`;
}

/**
 * 格式化费率（从基点转百分比）
 */
export function formatFee(fee: bigint): string {
  // fee是基点，例如3000表示0.3%
  return `${Number(fee) / 10000}%`;
}

