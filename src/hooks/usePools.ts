import { useReadContract } from "wagmi";
import { useMemo } from "react";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { POOL_MANAGER_ABI } from "@/lib/contracts/abis";
import type { PoolInfo } from "@/lib/contracts/types";

export function usePools() {
  const { data: pools, isLoading, error, refetch } = useReadContract({
    address: CONTRACTS.POOL_MANAGER,
    abi: POOL_MANAGER_ABI,
    functionName: "getAllPools",
  });

  // 使用 useMemo 稳定数组引用，避免不必要的重新渲染
  const stablePools = useMemo(() => {
    return (pools as PoolInfo[]) || [];
  }, [pools]);

  return {
    pools: stablePools,
    isLoading,
    error,
    refetch,
  };
}

