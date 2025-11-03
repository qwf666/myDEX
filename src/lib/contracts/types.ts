// 合约类型定义
import type { Address } from "viem";

export interface PoolInfo {
  pool: Address;
  token0: Address;
  token1: Address;
  index: bigint;
  fee: bigint;
  feeProtocol: bigint;
  tickLower: bigint;
  tickUpper: bigint;
  tick: bigint;
  sqrtPriceX96: bigint;
  liquidity: bigint;
}

export interface Pair {
  token0: Address;
  token1: Address;
}

export interface CreateAndInitializeParams {
  token0: Address;
  token1: Address;
  fee: bigint;
  tickLower: bigint;
  tickUpper: bigint;
  sqrtPriceX96: bigint;
}

export interface PositionInfo {
  id: bigint;
  owner: Address;
  token0: Address;
  token1: Address;
  index: bigint;
  fee: bigint;
  liquidity: bigint;
  tickLower: bigint;
  tickUpper: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
}

export interface MintParams {
  token0: Address;
  token1: Address;
  index: bigint;
  amount0Desired: bigint;
  amount1Desired: bigint;
  recipient: Address;
  deadline: bigint;
}

export interface ExactInputParams {
  tokenIn: Address;
  tokenOut: Address;
  indexPath: readonly bigint[];
  recipient: Address;
  deadline: bigint;
  amountIn: bigint;
  amountOutMinimum: bigint;
  sqrtPriceLimitX96: bigint;
}

export interface ExactOutputParams {
  tokenIn: Address;
  tokenOut: Address;
  indexPath: readonly bigint[];
  recipient: Address;
  deadline: bigint;
  amountOut: bigint;
  amountInMaximum: bigint;
  sqrtPriceLimitX96: bigint;
}

export interface QuoteExactInputParams {
  tokenIn: Address;
  tokenOut: Address;
  indexPath: readonly bigint[];
  amountIn: bigint;
  sqrtPriceLimitX96: bigint;
}

export interface QuoteExactOutputParams {
  tokenIn: Address;
  tokenOut: Address;
  indexPath: readonly bigint[];
  amountOut: bigint;
  sqrtPriceLimitX96: bigint;
}

export interface ERC20TokenInfo {
  address: Address;
  name: string;
  symbol: string;
  decimals: number;
}

