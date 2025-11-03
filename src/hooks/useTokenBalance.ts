import { useReadContract } from "wagmi";
import { useAccount } from "wagmi";
import { ERC20_ABI } from "@/lib/contracts/abis";
import { formatTokenAmount } from "@/lib/utils/format";
import type { Address } from "viem";

export function useTokenBalance(tokenAddress: Address | undefined, decimals: number = 18) {
  const { address } = useAccount();

  const { data: balance, isLoading, error, refetch } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!tokenAddress && !!address,
    },
  });

  return {
    balance: balance ? formatTokenAmount(balance, decimals) : "0",
    balanceRaw: balance || 0n,
    isLoading,
    error,
    refetch,
  };
}

