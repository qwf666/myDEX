"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useAccount } from "wagmi";
import { Button } from "@/components/ui/button";
import { ERC20_ABI } from "@/lib/contracts/abis";
import { useTokenAllowance } from "@/hooks/useTokenAllowance";
import { parseTokenAmount } from "@/lib/utils/format";
import { useTokenInfo } from "@/hooks/useTokenInfo";
import { useQueryClient } from "@tanstack/react-query";
import type { `0x${string}` } from "viem";

interface TokenApproveProps {
  tokenAddress: `0x${string}` | undefined;
  spender: `0x${string}` | undefined;
  amount: string;
  onApproved?: () => void;
}

export function TokenApprove({ 
  tokenAddress, 
  spender, 
  amount, 
  onApproved 
}: TokenApproveProps) {
  const { address } = useAccount();
  const { tokenInfo } = useTokenInfo(tokenAddress);
  const queryClient = useQueryClient();
  
  const { allowance, refetch: refetchAllowance } = useTokenAllowance(
    tokenAddress,
    spender
  );

  const amountNeeded = amount && tokenInfo 
    ? parseTokenAmount(amount, tokenInfo.decimals)
    : 0n;

  const needsApproval = allowance < amountNeeded;

  const { writeContract: approve, data: approveHash, isPending: isApproving } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  // 当审批成功时，刷新授权并调用回调
  if (isConfirmed && onApproved) {
    refetchAllowance();
    queryClient.invalidateQueries();
    onApproved();
  }

  const handleApprove = () => {
    if (!tokenAddress || !spender || !tokenInfo) return;

    // 审批一个非常大的数量（类似Max Uint256）
    const maxApproval = 2n ** 256n - 1n;

    approve({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, maxApproval],
    });
  };

  if (!needsApproval || !amount || amount === "0") {
    return null;
  }

  return (
    <Button
      onClick={handleApprove}
      disabled={isApproving || isConfirming || !address}
      className="w-full"
    >
      {isApproving || isConfirming
        ? "审批中..."
        : `授权 ${tokenInfo?.symbol || ""}`}
    </Button>
  );
}

