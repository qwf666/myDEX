import { useReadContract } from "wagmi";
import { useAccount } from "wagmi";
import { ERC20_ABI } from "@/lib/contracts/abis";
import type { Address } from "viem";

export function useTokenAllowance(
  tokenAddress: Address | undefined,
  spender: Address | undefined
) {
  const { address } = useAccount();

  const { data: allowance, isLoading, error, refetch } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && spender ? [address, spender] : undefined,
    query: {
      enabled: !!tokenAddress && !!address && !!spender,
    },
  });

  return {
    allowance: allowance || 0n,
    isLoading,
    error,
    refetch,
  };
}

