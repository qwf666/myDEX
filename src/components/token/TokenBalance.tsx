"use client";

import { useTokenBalance } from "@/hooks/useTokenBalance";
import { useTokenInfo } from "@/hooks/useTokenInfo";
import type { Address } from "viem";

interface TokenBalanceProps {
  tokenAddress: Address | undefined;
  label?: string;
}

export function TokenBalance({ tokenAddress, label = "余额" }: TokenBalanceProps) {
  const { tokenInfo } = useTokenInfo(tokenAddress);
  const { balance, isLoading } = useTokenBalance(
    tokenAddress,
    tokenInfo?.decimals || 18
  );

  if (!tokenAddress) {
    return <span className="text-sm text-muted-foreground">-</span>;
  }

  if (isLoading) {
    return <span className="text-sm text-muted-foreground">加载中...</span>;
  }

  return (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">
        {balance} {tokenInfo?.symbol || ""}
      </span>
    </div>
  );
}

