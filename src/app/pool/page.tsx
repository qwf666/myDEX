"use client";

import { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TokenSelector } from "@/components/token/TokenSelector";
import { usePools } from "@/hooks/usePools";
import { useTokenInfo } from "@/hooks/useTokenInfo";
import { CONTRACTS } from "@/lib/contracts/addresses";
import { POOL_MANAGER_ABI } from "@/lib/contracts/abis";
import { formatTokenAmount, formatFee, formatAddress, priceToSqrtX96 } from "@/lib/utils/format";
import { priceToTick } from "@/lib/utils/tick";
import type { PoolInfo } from "@/lib/contracts/types";
import type { Address } from "viem";

const ITEMS_PER_PAGE = 10;

export default function PoolPage() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();
  const { pools, isLoading: poolsLoading, refetch: refetchPools } = usePools();

  const [currentPage, setCurrentPage] = useState(1);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [token0, setToken0] = useState<Address | undefined>(undefined);
  const [token1, setToken1] = useState<Address | undefined>(undefined);
  const [fee, setFee] = useState("");
  const [tickLower, setTickLower] = useState("");
  const [tickUpper, setTickUpper] = useState("");
  const [initialPrice, setInitialPrice] = useState("");

  const { tokenInfo: token0Info } = useTokenInfo(token0);
  const { tokenInfo: token1Info } = useTokenInfo(token1);

  const { writeContract: createPool, data: createHash, isPending: isCreating } = useWriteContract();

  const { isLoading: isConfirming, isSuccess: isCreated } = useWaitForTransactionReceipt({
    hash: createHash,
  });

  // 计算分页数据
  const totalPages = Math.ceil(pools.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedPools = pools.slice(startIndex, endIndex);

  // 处理创建成功
  useEffect(() => {
    if (isCreated) {
      queryClient.invalidateQueries();
      refetchPools();
      setCreateDialogOpen(false);
      setToken0(undefined);
      setToken1(undefined);
      setFee("");
      setTickLower("");
      setTickUpper("");
      setInitialPrice("");
    }
  }, [isCreated, queryClient, refetchPools]);

  const handleCreatePool = () => {
    if (!token0 || !token1 || !fee || !tickLower || !tickUpper || !initialPrice) return;

    const feeBig = BigInt(Math.floor(parseFloat(fee) * 10000)); // 费率转换为基点
    const tickLowerBig = BigInt(tickLower);
    const tickUpperBig = BigInt(tickUpper);
    const price = parseFloat(initialPrice);
    const sqrtPriceX96 = priceToSqrtX96(price);

    createPool({
      address: CONTRACTS.POOL_MANAGER,
      abi: POOL_MANAGER_ABI,
      functionName: "createAndInitializePoolIfNecessary",
      args: [
        {
          token0,
          token1,
          fee: feeBig,
          tickLower: tickLowerBig,
          tickUpper: tickUpperBig,
          sqrtPriceX96,
        },
      ],
    });
  };

  if (!isConnected) {
    return (
      <main className="container py-6">
        <Card>
          <CardHeader>
            <CardTitle>连接钱包</CardTitle>
            <CardDescription>请连接钱包以查看和管理池子</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Pools</h1>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>创建池子</Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>创建新池子</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Token0</label>
                <TokenSelector selectedToken={token0} onSelect={setToken0} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Token1</label>
                <TokenSelector selectedToken={token1} onSelect={setToken1} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">费率 (%)</label>
                <Input
                  type="number"
                  placeholder="0.3"
                  value={fee}
                  onChange={(e) => setFee(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Tick Lower</label>
                <Input
                  type="number"
                  placeholder="-887272"
                  value={tickLower}
                  onChange={(e) => setTickLower(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Tick Upper</label>
                <Input
                  type="number"
                  placeholder="887272"
                  value={tickUpper}
                  onChange={(e) => setTickUpper(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">初始价格</label>
                <Input
                  type="number"
                  placeholder="1.0"
                  value={initialPrice}
                  onChange={(e) => setInitialPrice(e.target.value)}
                />
              </div>
              <Button
                onClick={handleCreatePool}
                disabled={
                  !token0 ||
                  !token1 ||
                  !fee ||
                  !tickLower ||
                  !tickUpper ||
                  !initialPrice ||
                  isCreating ||
                  isConfirming ||
                  token0 === token1
                }
                className="w-full"
              >
                {isCreating || isConfirming ? "创建中..." : "创建池子"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {poolsLoading ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">加载中...</p>
          </CardContent>
        </Card>
      ) : pools.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-center text-muted-foreground">暂无池子</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>交易对</TableHead>
                    <TableHead>费率</TableHead>
                    <TableHead>Index</TableHead>
                    <TableHead>价格范围</TableHead>
                    <TableHead>当前Tick</TableHead>
                    <TableHead>流动性</TableHead>
                    <TableHead>池子地址</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedPools.map((pool: PoolInfo, index: number) => (
                    <PoolTableRow key={startIndex + index} pool={pool} />
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 分页 */}
          {totalPages > 1 && (
            <Pagination className="mt-4">
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => setCurrentPage(page)}
                      isActive={currentPage === page}
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
                <PaginationItem>
                  <PaginationNext
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}

          {/* 分页信息 */}
          <div className="mt-2 text-sm text-muted-foreground text-center">
            显示 {startIndex + 1}-{Math.min(endIndex, pools.length)} / 共 {pools.length} 个池子
          </div>
        </>
      )}
    </main>
  );
}

function PoolTableRow({ pool }: { pool: PoolInfo }) {
  const { tokenInfo: token0Info } = useTokenInfo(pool.token0);
  const { tokenInfo: token1Info } = useTokenInfo(pool.token1);

  return (
    <TableRow>
      <TableCell className="font-medium">
        {token0Info?.symbol || formatAddress(pool.token0)} /{" "}
        {token1Info?.symbol || formatAddress(pool.token1)}
      </TableCell>
      <TableCell>{formatFee(pool.fee)}</TableCell>
      <TableCell>{pool.index.toString()}</TableCell>
      <TableCell>
        Tick {pool.tickLower.toString()} - {pool.tickUpper.toString()}
      </TableCell>
      <TableCell>{pool.tick.toString()}</TableCell>
      <TableCell>{formatTokenAmount(pool.liquidity)}</TableCell>
      <TableCell>
        <span className="font-mono text-xs">{formatAddress(pool.pool)}</span>
      </TableCell>
    </TableRow>
  );
}

