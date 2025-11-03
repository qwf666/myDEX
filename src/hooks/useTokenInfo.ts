import { useReadContract } from "wagmi";
import { ERC20_ABI } from "@/lib/contracts/abis";
import type { ERC20TokenInfo } from "@/lib/contracts/types";
import type { Address } from "viem";

export function useTokenInfo(tokenAddress: Address | undefined): {
  tokenInfo: ERC20TokenInfo | null;
  isLoading: boolean;
  error: Error | null;
} {
  const { data: name, isLoading: isLoadingName } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "name",
    query: { enabled: !!tokenAddress },
  });

  const { data: symbol, isLoading: isLoadingSymbol } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "symbol",
    query: { enabled: !!tokenAddress },
  });

  const { data: decimals, isLoading: isLoadingDecimals } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: "decimals",
    query: { enabled: !!tokenAddress },
  });

  const isLoading = isLoadingName || isLoadingSymbol || isLoadingDecimals;
  const tokenInfo: ERC20TokenInfo | null =
    tokenAddress && name && symbol && decimals !== undefined
      ? {
          address: tokenAddress,
          name: name as string,
          symbol: symbol as string,
          decimals: Number(decimals),
        }
      : null;

  return {
    tokenInfo,
    isLoading,
    error: null,
  };
}

