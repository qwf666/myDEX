import { useReadContract } from "wagmi";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { POOL_MANAGER_ABI } from "@/lib/contracts/abis";
import type { Pair } from "@/lib/contracts/types";

export function usePairs() {
  const { data: pairs, isLoading, error, refetch } = useReadContract({
    address: CONTRACTS.POOL_MANAGER,
    abi: POOL_MANAGER_ABI,
    functionName: "getPairs",
  });

  return {
    pairs: (pairs as Pair[]) || [],
    isLoading,
    error,
    refetch,
  };
}

