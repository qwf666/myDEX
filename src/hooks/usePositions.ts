import { useReadContract } from "wagmi";
import { useAccount } from "wagmi";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { POSITION_MANAGER_ABI, ERC721_ABI } from "@/lib/contracts/abis";
import type { PositionInfo } from "@/lib/contracts/types";

export function usePositions() {
  const { address } = useAccount();

  // 首先获取用户拥有的NFT数量
  const { data: balance } = useReadContract({
    address: CONTRACTS.POSITION_MANAGER,
    abi: ERC721_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  // 获取所有头寸（PositionManager.getAllPositions会返回所有头寸，我们可以在前端过滤）
  const { data: allPositions, isLoading, error, refetch } = useReadContract({
    address: CONTRACTS.POSITION_MANAGER,
    abi: POSITION_MANAGER_ABI,
    functionName: "getAllPositions",
    query: {
      enabled: !!address,
    },
  });

  // 过滤出当前用户的头寸
  const positions = (allPositions as PositionInfo[])?.filter(
    (pos) => pos.owner.toLowerCase() === address?.toLowerCase()
  ) || [];

  return {
    positions,
    isLoading,
    error,
    refetch,
  };
}

