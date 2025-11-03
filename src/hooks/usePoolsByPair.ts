import { usePools } from "./usePools";
import type { Address } from "viem";

export function usePoolsByPair(token0: Address | undefined, token1: Address | undefined) {
  const { pools } = usePools();

  if (!token0 || !token1) {
    return { pools: [], indexes: [] };
  }

  const matchingPools = pools.filter(
    (pool) =>
      (pool.token0.toLowerCase() === token0.toLowerCase() &&
        pool.token1.toLowerCase() === token1.toLowerCase()) ||
      (pool.token0.toLowerCase() === token1.toLowerCase() &&
        pool.token1.toLowerCase() === token0.toLowerCase())
  );

  const indexes = matchingPools.map((pool) => pool.index);

  return {
    pools: matchingPools,
    indexes,
  };
}

