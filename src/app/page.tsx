/**
 * Swap页面组件 - 去中心化交易所的代币交换界面
 * 
 * 功能说明：
 * 1. 允许用户选择输入和输出代币
 * 2. 自动选择最优的流动性池进行交换
 * 3. 实时计算交换价格和滑点
 * 4. 执行代币交换交易
 * 5. 支持两种交换模式：精确输入（Exact Input）和精确输出（Exact Output）
 */

"use client";

// ============ React核心Hooks ============
import { useState, useEffect, useMemo, useCallback } from "react";

// ============ Wagmi Hooks - 用于与区块链交互 ============
// useAccount: 获取当前连接的钱包地址和连接状态
// useSimulateContract: 模拟合约调用，用于价格估算（不消耗gas）
// useWriteContract: 写入合约，执行实际的交易
// useWaitForTransactionReceipt: 等待交易确认
import { useAccount } from "wagmi";
import { useSimulateContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";

// ============ React Query - 用于数据缓存和同步 ============
import { useQueryClient } from "@tanstack/react-query";

// ============ UI组件 ============
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";

// ============ 自定义组件 ============
import { TokenSelector } from "@/components/token/TokenSelector"; // 代币选择器组件
import { TokenBalance } from "@/components/token/TokenBalance"; // 代币余额显示组件

// ============ 合约配置 ============
import { CONTRACTS } from "@/lib/contracts/addresses"; // 合约地址配置
import { SWAP_ROUTER_ABI, ERC20_ABI } from "@/lib/contracts/abis"; // Swap路由合约ABI和ERC20 ABI

// ============ 自定义Hooks ============
import { usePools } from "@/hooks/usePools"; // 获取所有流动性池数据
import { useTokenInfo } from "@/hooks/useTokenInfo"; // 获取代币信息（名称、符号、小数位等）
import { useTokenAllowance } from "@/hooks/useTokenAllowance"; // 检查代币授权额度

// ============ 工具函数 ============
import { parseTokenAmount, formatTokenAmount, formatFee } from "@/lib/utils/format"; // 金额格式化工具
import { tickToSqrtPriceX96 } from "@/lib/utils/tick"; // Tick转价格工具

// ============ 图标 ============
import { ArrowUpDown } from "lucide-react"; // 切换图标

// ============ 类型定义 ============
import type { Address } from "viem"; // 以太坊地址类型

// ============ 常量定义 ============
/**
 * 价格限制常量 - 来自 Uniswap V3 的 TickMath.sol
 * 这些常量定义了价格的有效范围，防止溢出或下溢
 * 
 * MIN_SQRT_PRICE: 最小有效价格（sqrtPriceX96格式）
 *   对应 tick = -887272，表示价格的下限
 * 
 * MAX_SQRT_PRICE: 最大有效价格（sqrtPriceX96格式）
 *   对应 tick = 887272，表示价格的上限
 * 
 * 在 Uniswap V3 中，价格使用 sqrtPriceX96 格式存储：
 *   sqrtPriceX96 = sqrt(price) * 2^96
 *   这样可以保持高精度并避免浮点数运算
 */
const MIN_SQRT_PRICE = BigInt("4295128739");
const MAX_SQRT_PRICE = BigInt("1461446703485210103287273052203988822378723970342");

export default function SwapPage() {
  // ============ Wagmi Hooks - 钱包和账户信息 ============
  /**
   * useAccount Hook
   * 获取当前连接的钱包信息
   * 
   * address: 当前连接的钱包地址（Address类型），如果未连接则为undefined
   * isConnected: 钱包是否已连接的布尔值
   */
  const { address, isConnected } = useAccount();
  
  // ============ React Query客户端 ============
  /**
   * useQueryClient Hook
   * 获取React Query的查询客户端，用于手动刷新缓存数据
   * 在交易成功后，用于刷新余额、池子信息等缓存数据
   */
  const queryClient = useQueryClient();
  
  // ============ State变量 - 交换参数 ============
  /**
   * tokenIn - 输入代币地址
   * 类型: Address | undefined
   * 作用: 存储用户想要交换出去的代币地址
   * 初始值: undefined（用户需要选择代币）
   * 更新时机: 用户通过TokenSelector选择代币时
   */
  const [tokenIn, setTokenIn] = useState<Address | undefined>(undefined);
  
  /**
   * tokenOut - 输出代币地址
   * 类型: Address | undefined
   * 作用: 存储用户想要交换得到的代币地址
   * 初始值: undefined（用户需要选择代币）
   * 更新时机: 用户通过TokenSelector选择代币时，或点击切换按钮时
   */
  const [tokenOut, setTokenOut] = useState<Address | undefined>(undefined);
  
  /**
   * amountIn - 输入代币金额（字符串格式）
   * 类型: string
   * 作用: 存储用户输入的代币数量（人类可读格式，如"100.5"）
   * 初始值: ""（空字符串）
   * 更新时机: 
   *   - 用户在输入框中输入时
   *   - 在ExactOutput模式下，根据输出金额计算得出
   * 注意: 需要转换为BigInt格式才能用于合约调用
   */
  const [amountIn, setAmountIn] = useState("");
  
  /**
   * amountOut - 输出代币金额（字符串格式）
   * 类型: string
   * 作用: 存储预计得到的代币数量（人类可读格式）
   * 初始值: ""（空字符串）
   * 更新时机:
   *   - 在ExactInput模式下，根据输入金额和价格计算得出
   *   - 用户在输出框中输入时（切换到ExactOutput模式）
   * 注意: 需要转换为BigInt格式才能用于合约调用
   */
  const [amountOut, setAmountOut] = useState("");
  
  /**
   * isExactInput - 是否为精确输入模式
   * 类型: boolean
   * 作用: 标识当前的交换模式
   *   - true: ExactInput模式（精确输入）
   *     用户指定输入金额，系统计算输出金额
   *     适用于：用户想要交换特定数量的代币
   *   - false: ExactOutput模式（精确输出）
   *     用户指定输出金额，系统计算需要的输入金额
   *     适用于：用户想要得到特定数量的代币
   * 初始值: true（默认使用精确输入模式）
   * 更新时机:
   *   - 用户在输入框输入时，自动切换到ExactInput模式
   *   - 用户在输出框输入时，自动切换到ExactOutput模式
   *   - 点击切换按钮时，会反转此值
   */
  const [isExactInput, setIsExactInput] = useState(true);
  
  /**
   * indexPath - 流动性池索引路径
   * 类型: bigint[]
   * 作用: 存储用于交换的流动性池索引数组
   *   在Uniswap V3中，代币交换可能需要经过多个池子（多跳路由）
   *   例如：[0n, 5n] 表示先经过索引0的池子，再经过索引5的池子
   * 初始值: []（空数组，表示还未找到合适的池子）
   * 更新时机: 当calculatedIndexPath计算完成后，通过useEffect更新
   * 注意: 合约调用时需要转换为number[]格式
   */
  const [indexPath, setIndexPath] = useState<bigint[]>([]);

  // ============ 自定义Hooks - 获取链上数据 ============
  /**
   * usePools Hook
   * 获取所有可用的流动性池数据
   * 
   * pools: 流动性池数组，包含：
   *   - token0, token1: 池子中的两种代币地址
   *   - index: 池子的索引（唯一标识）
   *   - liquidity: 池子的流动性
   *   - sqrtPriceX96: 当前价格（sqrtPriceX96格式）
   *   - fee: 交易费率
   *   - tickLower, tickUpper: 价格范围
   */
  const { pools } = usePools();
  
  /**
   * useTokenInfo Hook - 获取输入代币信息
   * 
   * tokenInInfo: 输入代币的详细信息，包含：
   *   - name: 代币名称（如"Wrapped Ether"）
   *   - symbol: 代币符号（如"WETH"）
   *   - decimals: 小数位数（如18）
   *   - address: 代币合约地址
   * 注意: 当tokenIn为undefined时，tokenInInfo也为undefined
   */
  const { tokenInfo: tokenInInfo } = useTokenInfo(tokenIn);
  
  /**
   * useTokenInfo Hook - 获取输出代币信息
   * 
   * tokenOutInfo: 输出代币的详细信息，格式同tokenInInfo
   * 注意: 当tokenOut为undefined时，tokenOutInfo也为undefined
   */
  const { tokenInfo: tokenOutInfo } = useTokenInfo(tokenOut);

  // ============ useMemo - 计算流动性池路径 ============
  /**
   * poolsKey - 池子数据的序列化键
   * 类型: string
   * 作用: 将池子数组序列化为字符串，用于useMemo的依赖项
   *   由于React的依赖比较是浅比较，直接使用pools数组会导致不必要的重新计算
   *   通过序列化，只有当池子的内容真正改变时，calculatedIndexPath才会重新计算
   * 格式: "token0-token1-index,token0-token1-index,..."
   */
  const poolsKey = pools.length > 0 ? pools.map(p => `${p.token0}-${p.token1}-${p.index}`).join(',') : '';
  
  /**
   * calculatedIndexPath - 计算出的最优池子索引路径
   * 类型: bigint[]
   * 作用: 根据tokenIn和tokenOut，自动选择最优的流动性池
   *   选择策略：
   *   1. 找到所有匹配tokenIn和tokenOut的池子（支持双向匹配）
   *   2. 过滤掉未初始化（价格为0）或没有流动性的池子
   *   3. 选择流动性最大的池子
   *   4. 如果流动性相同，选择费率更低的池子
   * 返回值: 池子索引数组，目前只返回单个池子 [index]，但支持多跳路由扩展
   * 依赖: tokenIn, tokenOut, poolsKey（当这些值改变时重新计算）
   * 
   * 注意: 这是计算值，不直接用于状态，需要通过useEffect同步到indexPath
   */
  const calculatedIndexPath = useMemo(() => {
    if (!tokenIn || !tokenOut || pools.length === 0) {
      return [];
    }

    // 找到tokenIn和tokenOut匹配的池子
    const matchingPools = pools.filter(
      (pool) =>
        (pool.token0.toLowerCase() === tokenIn.toLowerCase() &&
          pool.token1.toLowerCase() === tokenOut.toLowerCase()) ||
        (pool.token0.toLowerCase() === tokenOut.toLowerCase() &&
          pool.token1.toLowerCase() === tokenIn.toLowerCase())
    );

    if (matchingPools.length > 0) {
      // 过滤掉价格为 0 的池子（未初始化的池子）
      const validPools = matchingPools.filter(pool => pool.sqrtPriceX96 > BigInt(0) && pool.liquidity > BigInt(0));
      
      if (validPools.length === 0) {
        console.log('没有有效的池子（价格或流动性为 0）');
        return [];
      }
      
      // 选择流动性最大的池子（最优池子）
      // 如果流动性相同，选择费率最低的
      const bestPool = validPools.reduce((best, current) => {
        // 比较流动性
        if (current.liquidity > best.liquidity) {
          return current;
        }
        if (current.liquidity < best.liquidity) {
          return best;
        }
        // 流动性相同，选择费率更低的
        if (current.fee < best.fee) {
          return current;
        }
        return best;
      });
      
      console.log('选择的池子:', {
        index: bestPool.index,
        liquidity: bestPool.liquidity.toString(),
        fee: bestPool.fee.toString(),
        sqrtPriceX96: bestPool.sqrtPriceX96.toString(),
        token0: bestPool.token0,
        token1: bestPool.token1,
      });
      
      return [bestPool.index];
    }
    return [];
  }, [tokenIn, tokenOut, poolsKey]);

  // ============ useEffect - 同步计算路径到状态 ============
  /**
   * useEffect - 同步calculatedIndexPath到indexPath状态
   * 作用: 当calculatedIndexPath计算完成后，将其同步到indexPath状态
   *   这样indexPath状态会在calculatedIndexPath稳定后更新，避免不必要的重新渲染
   * 触发时机: calculatedIndexPath改变时
   */
  useEffect(() => {
    setIndexPath(calculatedIndexPath);
  }, [calculatedIndexPath]);

  // ============ useMemo - 类型转换 ============
  /**
   * indexPathAsNumbers - 将池子索引从bigint[]转换为number[]
   * 类型: number[]
   * 作用: 合约调用需要number[]格式（uint32[]），而状态中存储的是bigint[]
   *   进行类型转换以便传递给合约
   * 依赖: indexPath（当路径改变时重新转换）
   * 
   * 注意: 转换时使用Number()，如果索引值超出JavaScript number范围会丢失精度
   *   但在实际应用中，池子索引通常不会很大
   */
  const indexPathAsNumbers = useMemo(() => {
    return indexPath.map(idx => Number(idx));
  }, [indexPath]);

  // ============ useMemo - 计算价格限制 ============
  /**
   * sqrtPriceLimitX96 - 交易的价格限制（sqrtPriceX96格式）
   * 类型: bigint
   * 作用: 设置交易允许的最大价格变动，防止价格滑点过大
   *   这是Uniswap V3中的一个重要安全机制，可以防止交易执行时价格超出预期范围
   * 
   * 计算逻辑：
   * 1. 根据交易方向（zeroForOne）设置不同的价格限制
   *    - zeroForOne = true: 从token0换token1，价格下降，设置下限
   *    - zeroForOne = false: 从token1换token0，价格上升，设置上限
   * 2. 优先使用池子的tickLower/tickUpper作为限制
   * 3. 如果不可用，使用当前价格的1%变化（99%或101%）
   * 4. 确保价格在MIN_SQRT_PRICE和MAX_SQRT_PRICE范围内
   * 
   * 返回值: 
   *   - 有效的价格限制值（bigint）
   *   - 0n（如果无法计算，表示不设置限制或交易无效）
   * 
   * 依赖: tokenIn, tokenOut, calculatedIndexPath, pools
   */
  const sqrtPriceLimitX96 = useMemo(() => {
    if (!tokenIn || !tokenOut || calculatedIndexPath.length === 0 || pools.length === 0) {
      return BigInt(0);
    }

    // 找到选择的池子：不仅要匹配 index，还要确保 token 地址匹配
    const selectedPool = pools.find(p => {
      const indexMatch = p.index === calculatedIndexPath[0];
      const tokenMatch = 
        (p.token0.toLowerCase() === tokenIn.toLowerCase() && p.token1.toLowerCase() === tokenOut.toLowerCase()) ||
        (p.token0.toLowerCase() === tokenOut.toLowerCase() && p.token1.toLowerCase() === tokenIn.toLowerCase());
      return indexMatch && tokenMatch;
    });
    
    if (!selectedPool) {
      console.log("sqrtPriceLimitX96 计算: 未找到匹配的池子", {
        calculatedIndexPath: calculatedIndexPath[0].toString(),
        tokenIn,
        tokenOut,
        availablePools: pools.filter(p => p.index === calculatedIndexPath[0]).map(p => ({
          index: p.index.toString(),
          token0: p.token0,
          token1: p.token1,
        })),
      });
      return BigInt(0);
    }
    
    // 确保池子已初始化（价格不为 0）且有流动性
    if (selectedPool.sqrtPriceX96 === BigInt(0) || selectedPool.liquidity === BigInt(0)) {
      console.log("sqrtPriceLimitX96 计算: 池子未初始化或没有流动性", {
        poolIndex: selectedPool.index.toString(),
        sqrtPriceX96: selectedPool.sqrtPriceX96.toString(),
        liquidity: selectedPool.liquidity.toString(),
        token0: selectedPool.token0,
        token1: selectedPool.token1,
      });
      return BigInt(0);
    }

    // 判断交易方向：zeroForOne = tokenIn 是 token0 (从 token0 换 token1)
    // 在池子中，token0 和 token1 是排序的，所以需要判断 tokenIn 是 token0 还是 token1
    const zeroForOne = tokenIn.toLowerCase() === selectedPool.token0.toLowerCase();
    const currentPrice = selectedPool.sqrtPriceX96;
    
    let result = BigInt(0);
    
    if (zeroForOne) {
      // 从 token0 换 token1，价格会下降
      // sqrtPriceLimitX96 必须 < sqrtPriceX96 且 > MIN_SQRT_PRICE
      // 设置一个合理的下限：使用池子的 tickLower 对应的价格，或当前价格的 1%
      const tickLowerNum = Number(selectedPool.tickLower);
      if (tickLowerNum > -887272) {
        const lowerLimit = tickToSqrtPriceX96(tickLowerNum);
        // 确保 lowerLimit < currentPrice 且 > MIN_SQRT_PRICE
        if (lowerLimit < currentPrice && lowerLimit > MIN_SQRT_PRICE) {
          result = lowerLimit;
        }
      }
      // 如果 tickLower 不可用，使用当前价格的 99%（但确保 > MIN_SQRT_PRICE）
      if (result === BigInt(0)) {
        const onePercentPrice = (currentPrice * BigInt(99)) / BigInt(100);
        result = onePercentPrice > MIN_SQRT_PRICE ? onePercentPrice : MIN_SQRT_PRICE + BigInt(1);
      }
    } else {
      // 从 token1 换 token0，价格会上升
      // sqrtPriceLimitX96 必须 > sqrtPriceX96 且 < MAX_SQRT_PRICE
      // 设置一个合理的上限：使用池子的 tickUpper 对应的价格，或当前价格的 101%
      const tickUpperNum = Number(selectedPool.tickUpper);
      if (tickUpperNum < 887272) {
        const upperLimit = tickToSqrtPriceX96(tickUpperNum);
        // 确保 upperLimit > currentPrice 且 < MAX_SQRT_PRICE
        if (upperLimit > currentPrice && upperLimit < MAX_SQRT_PRICE) {
          result = upperLimit;
        }
      }
      // 如果 tickUpper 不可用，使用当前价格的 101%（但确保 < MAX_SQRT_PRICE）
      if (result === BigInt(0)) {
        const onePercentPrice = (currentPrice * BigInt(101)) / BigInt(100);
        result = onePercentPrice < MAX_SQRT_PRICE ? onePercentPrice : MAX_SQRT_PRICE - BigInt(1);
      }
    }
    
    console.log("sqrtPriceLimitX96 计算结果:", {
      zeroForOne,
      currentPrice: currentPrice.toString(),
      result: result.toString(),
      poolIndex: selectedPool.index.toString(),
    });
    
    return result;
  }, [tokenIn, tokenOut, calculatedIndexPath, pools]);
  
  // ============ Wagmi Hooks - 价格估算（模拟合约调用） ============
  /**
   * useSimulateContract Hook - 模拟合约调用进行价格估算
   * 作用: 调用合约的view函数（不消耗gas）来估算交换价格
   *   这是一个"只读"调用，不会真正执行交易，只用于显示预期结果
   * 
   * 返回值:
   *   - quoteSimulation: 模拟调用的结果，包含估算的交换金额
   *   - isQuoteLoading: 是否正在加载价格估算
   *   - quoteError: 价格估算错误（如流动性不足、池子未初始化等）
   * 
   * 调用函数:
   *   - isExactInput为true时: 调用"quoteExactInput"（给定输入金额，计算输出金额）
   *   - isExactInput为false时: 调用"quoteExactOutput"（给定输出金额，计算输入金额）
   * 
   * 启用条件（enabled）:
   *   只有当以下所有条件都满足时才会执行查询：
   *   - tokenIn和tokenOut都已选择
   *   - calculatedIndexPath有值（找到了合适的池子）
   *   - tokenInInfo和tokenOutInfo都已加载
   *   - sqrtPriceLimitX96 > 0（价格限制有效）
   *   - indexPathAsNumbers有值
   *   - 根据模式，amountIn或amountOut有值且不为"0"
   */
  const { data: quoteSimulation, isLoading: isQuoteLoading, error: quoteError } = useSimulateContract({
    address: CONTRACTS.SWAP_ROUTER,
    abi: SWAP_ROUTER_ABI,
    functionName: isExactInput ? "quoteExactInput" : "quoteExactOutput",
    args: isExactInput && amountIn && calculatedIndexPath.length > 0 && tokenIn && tokenOut && sqrtPriceLimitX96 > BigInt(0) && tokenInInfo
      ? [
          {
            tokenIn,
            tokenOut,
            indexPath: indexPathAsNumbers as readonly number[],
            amountIn: parseTokenAmount(amountIn, tokenInInfo.decimals),
            sqrtPriceLimitX96,
          },
        ]
      : !isExactInput && amountOut && calculatedIndexPath.length > 0 && tokenIn && tokenOut && sqrtPriceLimitX96 > BigInt(0) && tokenOutInfo
      ? [
          {
            tokenIn,
            tokenOut,
            indexPath: indexPathAsNumbers as readonly number[],
            amountOut: parseTokenAmount(amountOut, tokenOutInfo.decimals),
            sqrtPriceLimitX96,
          },
        ]
      : undefined,
    query: {
      enabled: Boolean(
        tokenIn &&
        tokenOut &&
        calculatedIndexPath.length > 0 &&
        tokenInInfo &&
        tokenOutInfo &&
        sqrtPriceLimitX96 > BigInt(0) &&
        indexPathAsNumbers.length > 0 &&
        ((isExactInput && !!amountIn && amountIn !== "0") ||
          (!isExactInput && !!amountOut && amountOut !== "0"))
      ),
    },
  });

  /**
   * quoteAmount - 从价格估算结果中提取的交换金额
   * 类型: bigint | undefined
   * 作用: 存储合约返回的估算交换金额（原始BigInt格式）
   *   - ExactInput模式: 表示预计得到的输出代币数量
   *   - ExactOutput模式: 表示需要的输入代币数量
   * 注意: 这是原始值，需要根据代币的小数位数格式化为人类可读格式
   */
  const quoteAmount = quoteSimulation?.result as bigint | undefined;

  // ============ useEffect - 处理价格计算错误 ============
  /**
   * useEffect - 处理价格估算错误
   * 作用: 当价格估算失败时，清空相应的金额显示，避免显示错误信息
   *   错误可能的原因：
   *   - 池子流动性不足
   *   - 池子未初始化
   *   - 价格超出限制范围
   *   - 网络问题等
   * 
   * 处理逻辑:
   *   - ExactInput模式: 清空amountOut（输出金额）
   *   - ExactOutput模式: 清空amountIn（输入金额）
   * 
   * 触发时机: quoteError改变时
   */
  useEffect(() => {
    if (quoteError) {
      console.error("价格计算错误:", quoteError);
      console.error("错误详情:", {
        tokenIn,
        tokenOut,
        indexPath: indexPathAsNumbers,
        amountIn,
        amountOut,
        isExactInput,
        tokenInInfo,
        tokenOutInfo,
      });
      // 如果计算失败，清空输出金额
      if (isExactInput) {
        setAmountOut("");
      } else {
        setAmountIn("");
      }
    }
  }, [quoteError, isExactInput, tokenIn, tokenOut, indexPathAsNumbers, amountIn, amountOut, tokenInInfo, tokenOutInfo]);

  // ============ useEffect - 更新显示金额 ============
  /**
   * useEffect - 根据价格估算结果更新显示金额
   * 作用: 当价格估算成功时，将估算结果格式化为人类可读格式并更新到UI
   * 
   * 更新逻辑:
   *   - ExactInput模式: 将quoteAmount格式化为输出代币的金额，更新amountOut
   *   - ExactOutput模式: 将quoteAmount格式化为输入代币的金额，更新amountIn
   * 
   * 格式化过程:
   *   1. 使用formatTokenAmount将BigInt转换为字符串（考虑小数位）
   *   2. 验证格式化后的值是否有效（不为"0"且为有效数字）
   *   3. 如果有效则更新状态，否则清空
   * 
   * 触发时机: quoteAmount、isExactInput、tokenInInfo、tokenOutInfo、quoteError改变时
   * 
   * 注意: 只有在没有错误时才更新，避免在错误时显示错误的值
   */
  useEffect(() => {
    console.log("更新输出金额 useEffect 触发:", {
      quoteAmount: quoteAmount?.toString(),
      isExactInput,
      hasTokenOutInfo: !!tokenOutInfo,
      hasTokenInInfo: !!tokenInInfo,
      quoteError: !!quoteError,
    });
    
    // 只有在没有错误时才更新金额
    if (quoteError) {
      console.log("有错误，不更新金额");
      return;
    }
    
    if (isExactInput && quoteAmount && tokenOutInfo) {
      const formatted = formatTokenAmount(quoteAmount, tokenOutInfo.decimals);
      console.log("格式化输出金额:", {
        quoteAmount: quoteAmount.toString(),
        decimals: tokenOutInfo.decimals,
        formatted,
      });
      // 确保格式化的金额是有效的数字
      if (formatted && formatted !== "0" && !isNaN(Number(formatted))) {
        setAmountOut(formatted);
      } else {
        console.log("格式化后的金额无效，清空");
        setAmountOut("");
      }
    } else if (!isExactInput && quoteAmount && tokenInInfo) {
      const formatted = formatTokenAmount(quoteAmount, tokenInInfo.decimals);
      console.log("格式化输入金额:", {
        quoteAmount: quoteAmount.toString(),
        decimals: tokenInInfo.decimals,
        formatted,
      });
      // 确保格式化的金额是有效的数字
      if (formatted && formatted !== "0" && !isNaN(Number(formatted))) {
        setAmountIn(formatted);
      } else {
        console.log("格式化后的金额无效，清空");
        setAmountIn("");
      }
    } else {
      console.log("不满足更新条件");
    }
  }, [quoteAmount, isExactInput, tokenInInfo, tokenOutInfo, quoteError]);

  // ============ 授权检查 ============
  /**
   * useTokenAllowance Hook - 检查输入代币对SWAP_ROUTER的授权额度
   * 作用: 检查用户是否已授权SWAP_ROUTER合约可以花费输入代币
   * 
   * 返回值:
   *   - allowance: 当前授权额度（BigInt格式）
   *   - isLoading: 是否正在加载授权额度
   *   - refetch: 手动刷新授权额度的函数
   */
  const { allowance, isLoading: isAllowanceLoading, refetch: refetchAllowance } = useTokenAllowance(
    tokenIn,
    CONTRACTS.SWAP_ROUTER
  );

  /**
   * 计算需要的授权额度
   * 根据交换模式计算实际需要的代币数量
   */
  const requiredAmount = useMemo(() => {
    if (isExactInput && amountIn && tokenInInfo) {
      return parseTokenAmount(amountIn, tokenInInfo.decimals);
    } else if (!isExactInput && amountOut && tokenOutInfo && quoteAmount) {
      // 在ExactOutput模式下，需要的输入金额由quoteAmount提供
      return quoteAmount as bigint;
    }
    return BigInt(0);
  }, [isExactInput, amountIn, amountOut, tokenInInfo, tokenOutInfo, quoteAmount]);

  /**
   * 检查是否需要授权
   * 如果当前授权额度小于需要的金额，则需要授权
   */
  const needsApproval = useMemo(() => {
    if (!tokenIn || requiredAmount === BigInt(0)) return false;
    return allowance < requiredAmount;
  }, [allowance, requiredAmount, tokenIn]);

  // ============ Wagmi Hooks - 执行授权 ============
  /**
   * useWriteContract Hook - 执行代币授权
   * 作用: 授权SWAP_ROUTER合约可以花费用户的输入代币
   */
  const { writeContract: approve, data: approveHash, isPending: isApproving } = useWriteContract();

  /**
   * useWaitForTransactionReceipt Hook - 等待授权交易确认
   * 作用: 监听授权交易哈希，等待交易被区块链确认
   */
  const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({
    hash: approveHash,
  });

  // ============ useEffect - 处理授权成功 ============
  /**
   * useEffect - 处理授权成功后的操作
   * 作用: 当授权成功确认后，刷新授权额度，然后自动执行swap
   */
  useEffect(() => {
    if (isApproveSuccess) {
      refetchAllowance();
      queryClient.invalidateQueries();
      // 授权成功后，自动执行swap（通过设置一个标志来触发）
      // 注意：这里不直接调用handleSwap，而是通过状态来触发
    }
  }, [isApproveSuccess, refetchAllowance, queryClient]);

  // ============ Wagmi Hooks - 执行交易 ============
  /**
   * useWriteContract Hook - 写入合约执行交易
   * 作用: 提供执行合约写入操作（消耗gas）的函数
   * 
   * 返回值:
   *   - swap: 执行交换交易的函数，调用时会弹出钱包确认对话框
   *   - swapHash: 交易哈希（Transaction Hash），用于追踪交易状态
   *   - isSwapPending: 是否正在等待用户确认交易（钱包弹窗中）
   * 
   * 注意: 
   *   - swap函数不会立即执行，而是返回一个Promise
   *   - 用户需要在钱包中确认交易
   *   - 交易确认后，会返回交易哈希
   */
  const { writeContract: swap, data: swapHash, isPending: isSwapPending } = useWriteContract();

  /**
   * useWaitForTransactionReceipt Hook - 等待交易确认
   * 作用: 监听交易哈希，等待交易被区块链确认（打包进区块）
   * 
   * 返回值:
   *   - isConfirming: 是否正在等待交易确认（交易已提交但未确认）
   *   - isSwapSuccess: 交易是否已成功确认（交易已被打包进区块）
   * 
   * 状态流程:
   *   1. 用户确认交易 → swapHash生成 → isSwapPending = false
   *   2. 交易提交到网络 → isConfirming = true
   *   3. 交易被打包确认 → isSwapSuccess = true, isConfirming = false
   * 
   * 注意: 交易确认可能需要几秒到几分钟，取决于网络拥堵情况
   */
  const { isLoading: isConfirming, isSuccess: isSwapSuccess } = useWaitForTransactionReceipt({
    hash: swapHash,
  });

  // ============ useEffect - 处理交易成功 ============
  /**
   * useEffect - 处理交易成功后的清理工作
   * 作用: 当交易成功确认后，执行以下操作：
   *   1. 刷新所有React Query缓存（余额、池子信息等）
   *   2. 清空输入和输出金额，重置表单状态
   * 
   * 触发时机: isSwapSuccess变为true时
   * 
   * 注意: invalidateQueries会触发所有相关查询的重新获取，确保UI显示最新数据
   */
  useEffect(() => {
    if (isSwapSuccess) {
      queryClient.invalidateQueries();
      setAmountIn("");
      setAmountOut("");
    }
  }, [isSwapSuccess, queryClient]);

  // ============ 主要函数 - 执行授权 ============
  /**
   * handleApprove - 执行代币授权
   * 作用: 授权SWAP_ROUTER合约可以花费用户的输入代币
   * 
   * 授权策略:
   *   - 授权一个非常大的数量（类似Max Uint256），避免频繁授权
   *   - 这样用户只需要授权一次，之后就可以进行多次swap
   */
  const handleApprove = () => {
    if (!tokenIn || !tokenInInfo) return;

    // 审批一个非常大的数量（类似Max Uint256）
    const maxApproval = BigInt(2) ** BigInt(256) - BigInt(1);

    approve({
      address: tokenIn,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [CONTRACTS.SWAP_ROUTER, maxApproval],
    });
  };

  // ============ 主要函数 - 执行交换 ============
  /**
   * executeSwap - 实际执行代币交换的内部函数
   * 作用: 根据当前的交换模式（ExactInput或ExactOutput），调用合约执行交换
   * 
   * 执行流程:
   *   1. 前置检查：验证tokenIn、tokenOut、address、indexPath是否有效
   *   2. 计算交易截止时间（当前时间 + 20分钟）
   *   3. 根据模式执行不同的交换逻辑
   * 
   * ExactInput模式（精确输入）:
   *   - 用户指定输入金额，系统计算输出金额
   *   - 调用合约的"exactInput"函数
   *   - 设置amountOutMinimum（最小输出金额，包含5%滑点保护）
   *   - 如果实际输出 < amountOutMinimum，交易会失败（保护用户）
   * 
   * ExactOutput模式（精确输出）:
   *   - 用户指定输出金额，系统计算需要的输入金额
   *   - 调用合约的"exactOutput"函数
   *   - 设置amountInMaximum（最大输入金额，包含5%滑点保护）
   *   - 如果实际输入 > amountInMaximum，交易会失败（保护用户）
   * 
   * 滑点保护:
   *   - 5%的滑点容忍度：允许价格在5%范围内波动
   *   - ExactInput: 允许输出金额比预期少5%
   *   - ExactOutput: 允许输入金额比预期多5%
   * 
   * 交易参数:
   *   - tokenIn/tokenOut: 代币地址
   *   - indexPath: 流动性池路径（转换为number[]）
   *   - recipient: 接收代币的地址（当前用户地址）
   *   - deadline: 交易有效期（20分钟后过期）
   *   - sqrtPriceLimitX96: 价格限制（防止价格滑点过大）
   *   - amountIn/amountOut: 交换金额（BigInt格式）
   *   - amountOutMinimum/amountInMaximum: 滑点保护参数
   * 
   * 注意: 
   *   - 调用swap函数会弹出钱包确认对话框
   *   - 用户需要确认并支付gas费用
   *   - 交易执行可能需要一定时间
   */
  const executeSwap = useCallback(() => {
    if (!tokenIn || !tokenOut || !address || indexPath.length === 0) return;

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 20); // 20分钟后过期

    if (isExactInput && amountIn && tokenInInfo) {
      const amountInBig = parseTokenAmount(amountIn, tokenInInfo.decimals);
      const amountOutMinimum = quoteAmount
        ? (quoteAmount as bigint) - ((quoteAmount as bigint) * BigInt(5)) / BigInt(100) // 5%滑点保护
        : BigInt(0);

      console.log({
        tokenIn,
        tokenOut,
        indexPath: indexPathAsNumbers as readonly number[],
        recipient: address,
        deadline,
        amountIn: amountInBig,
        amountOutMinimum,
        sqrtPriceLimitX96,
      },'exactInput');

      swap({
        address: CONTRACTS.SWAP_ROUTER,
        abi: SWAP_ROUTER_ABI,
        functionName: "exactInput",
        args: [
          {
            tokenIn,
            tokenOut,
            indexPath: indexPathAsNumbers as readonly number[],
            recipient: address,
            deadline,
            amountIn: amountInBig,
            amountOutMinimum,
            sqrtPriceLimitX96,
          },
        ],
      });
    } else if (!isExactInput && amountOut && tokenOutInfo) {
      const amountOutBig = parseTokenAmount(amountOut, tokenOutInfo.decimals);
      const amountInMaximum = quoteAmount
        ? (quoteAmount as bigint) + ((quoteAmount as bigint) * BigInt(5)) / BigInt(100) // 5%滑点保护
        : BigInt(2) ** BigInt(256) - BigInt(1);

      swap({
        address: CONTRACTS.SWAP_ROUTER,
        abi: SWAP_ROUTER_ABI,
        functionName: "exactOutput",
        args: [
          {
            tokenIn,
            tokenOut,
            indexPath: indexPathAsNumbers as readonly number[],
            recipient: address,
            deadline,
            amountOut: amountOutBig,
            amountInMaximum,
            sqrtPriceLimitX96,
          },
        ],
      });
    }
  }, [
    tokenIn,
    tokenOut,
    address,
    indexPath.length,
    isExactInput,
    amountIn,
    amountOut,
    tokenInInfo,
    tokenOutInfo,
    quoteAmount,
    indexPathAsNumbers,
    sqrtPriceLimitX96,
    swap,
  ]);

  // ============ useEffect - 授权成功后自动执行swap ============
  /**
   * useEffect - 当授权成功确认后，自动执行swap
   * 作用: 避免用户需要手动点击两次按钮（先授权，再swap）
   * 
   * 注意: 使用一个状态来跟踪是否需要自动执行swap
   *   这样可以避免在授权成功后立即执行，而是等待授权额度刷新完成
   */
  const [shouldAutoSwap, setShouldAutoSwap] = useState(false);

  useEffect(() => {
    if (isApproveSuccess) {
      // 授权成功，标记需要自动执行swap
      setShouldAutoSwap(true);
    }
  }, [isApproveSuccess]);

  useEffect(() => {
    if (shouldAutoSwap && !needsApproval && !isAllowanceLoading) {
      // 授权成功、不再需要授权、且授权额度已刷新时，自动执行swap
      setShouldAutoSwap(false);
      const timer = setTimeout(() => {
        executeSwap();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [shouldAutoSwap, needsApproval, isAllowanceLoading, executeSwap]);

  /**
   * handleSwap - 执行代币交换交易的主函数（带授权检查）
   * 作用: 在执行swap之前，先检查授权状态
   * 
   * 执行流程:
   *   1. 检查是否需要授权
   *   2. 如果需要授权，先执行授权操作
   *   3. 如果不需要授权或授权已完成，直接执行swap
   */
  const handleSwap = () => {
    if (!tokenIn || !tokenOut || !address || indexPath.length === 0) return;

    // 检查是否需要授权
    if (needsApproval) {
      // 需要授权，先执行授权
      handleApprove();
    } else {
      // 不需要授权，直接执行swap
      executeSwap();
    }
  };

  // ============ 主要函数 - 切换代币 ============
  /**
   * handleSwitchTokens - 切换输入和输出代币
   * 作用: 当用户点击切换按钮时，交换输入和输出代币的位置
   * 
   * 执行操作:
   *   1. 交换tokenIn和tokenOut
   *   2. 交换amountIn和amountOut
   *   3. 反转isExactInput模式（因为交换了输入输出）
   * 
   * 使用场景:
   *   - 用户想要交换方向（例如从ETH换USDT改为USDT换ETH）
   *   - 提供更好的用户体验，无需手动重新选择代币
   * 
   * 注意: 交换后，之前的金额可能会因为价格变化而需要重新计算
   */
  const handleSwitchTokens = () => {
    const tempToken = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(tempToken);
    const tempAmount = amountIn;
    setAmountIn(amountOut);
    setAmountOut(tempAmount);
    setIsExactInput(!isExactInput);
  };

  // ============ 计算值 - 是否允许交换 ============
  /**
   * canSwap - 判断是否可以执行交换
   * 类型: boolean
   * 作用: 检查所有必要条件是否满足，决定Swap按钮是否可用
   * 
   * 检查条件（全部满足才能交换）:
   *   1. isConnected: 钱包必须已连接
   *   2. tokenIn: 输入代币必须已选择
   *   3. tokenOut: 输出代币必须已选择
   *   4. tokenIn !== tokenOut: 输入和输出代币不能相同
   *   5. indexPath.length > 0: 必须找到可用的流动性池
   *   6. 金额条件（二选一）:
   *      - ExactInput模式: amountIn有值且不为"0"
   *      - ExactOutput模式: amountOut有值且不为"0"
   * 
   * 使用场景:
   *   - 控制Swap按钮的disabled状态
   *   - 在按钮文本中显示"输入金额"提示
   * 
   * 注意: 这个值会在每次渲染时重新计算，确保UI状态实时更新
   */
  const canSwap =
    isConnected &&
    tokenIn &&
    tokenOut &&
    tokenIn !== tokenOut &&
    indexPath.length > 0 &&
    ((isExactInput && amountIn && amountIn !== "0") ||
      (!isExactInput && amountOut && amountOut !== "0"));

  /**
   * 计算按钮文本和禁用状态
   * 根据授权状态和交易状态显示不同的按钮文本
   */
  const getButtonText = () => {
    if (isApproving || isApproveConfirming) {
      return "授权中...";
    }
    if (isSwapPending || isConfirming) {
      return "交易中...";
    }
    if (!canSwap) {
      return "输入金额";
    }
    if (needsApproval) {
      return `授权 ${tokenInInfo?.symbol || ""}`;
    }
    return "Swap";
  };

  /**
   * 计算按钮是否禁用
   * 在以下情况下禁用按钮：
   * - 不满足交换条件
   * - 正在授权或等待授权确认
   * - 正在执行swap或等待swap确认
   * - 正在计算价格
   * - 正在加载授权额度
   */
  const isButtonDisabled =
    !canSwap ||
    isApproving ||
    isApproveConfirming ||
    isSwapPending ||
    isConfirming ||
    isQuoteLoading ||
    isAllowanceLoading;

  // ============ UI渲染 - 钱包未连接状态 ============
  /**
   * 条件渲染：钱包未连接时的提示界面
   * 当用户未连接钱包时，显示提示信息，引导用户连接钱包
   */
  if (!isConnected) {
    return (
      <main className="container py-6">
        <Card>
          <CardHeader>
            <CardTitle>连接钱包</CardTitle>
            <CardDescription>请连接钱包以进行Swap交易</CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  // ============ UI渲染 - 主界面 ============
  /**
   * 主Swap界面渲染
   * 包含以下部分：
   * 1. 输入代币选择区和金额输入
   * 2. 切换按钮（交换输入输出）
   * 3. 输出代币选择区和金额显示
   * 4. 池子信息显示
   * 5. Swap执行按钮
   */
  return (
    <main className="container py-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle>Swap</CardTitle>
          <CardDescription>交换代币</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* ========== 输入代币区域 ========== */}
          {/* 
            输入代币选择区：
            - 左侧：代币选择器（TokenSelector组件）
            - 右侧：金额输入框
            - 顶部：显示"From"标签和当前代币余额
            - 输入框功能：
              * 用户输入时，自动切换到ExactInput模式
              * 在ExactOutput模式下，如果正在计算价格，则禁用输入框
          */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">From</label>
              {/* 显示输入代币的余额 */}
              <TokenBalance tokenAddress={tokenIn} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                {/* 代币选择器：允许用户选择输入代币 */}
                <TokenSelector selectedToken={tokenIn} onSelect={setTokenIn} />
              </div>
              <div className="flex-1">
                {/* 
                  金额输入框：
                  - type="number": 数字输入类型
                  - value: 绑定到amountIn状态
                  - onChange: 用户输入时更新amountIn，并切换到ExactInput模式
                  - disabled: 在ExactOutput模式且正在计算价格时禁用
                  - className: 右对齐，大字体，便于阅读
                */}
                <Input
                  type="number"
                  placeholder="0.0"
                  value={amountIn}
                  onChange={(e) => {
                    setAmountIn(e.target.value);
                    setIsExactInput(true); // 输入时自动切换到ExactInput模式
                  }}
                  disabled={!isExactInput && isQuoteLoading} // ExactOutput模式下，计算价格时禁用
                  className="text-right text-lg"
                />
              </div>
            </div>
          </div>

          {/* ========== 切换按钮 ========== */}
          {/* 
            切换输入输出代币的按钮：
            - variant="ghost": 幽灵样式，不突出
            - size="icon": 图标按钮大小
            - onClick: 调用handleSwitchTokens函数
            - 图标：ArrowUpDown，表示上下交换
          */}
          <div className="flex justify-center -my-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSwitchTokens}
              className="rounded-full h-10 w-10"
            >
              <ArrowUpDown className="h-5 w-5" />
            </Button>
          </div>

          {/* ========== 输出代币区域 ========== */}
          {/* 
            输出代币选择区：
            - 结构与输入代币区域类似
            - 输入框功能：
              * 用户输入时，自动切换到ExactOutput模式
              * 在ExactInput模式下，如果正在计算价格，则禁用输入框
            - 状态提示：
              * 计算中：显示"计算中..."提示
              * 错误：显示红色错误提示
          */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium">To</label>
              {/* 显示输出代币的余额 */}
              <TokenBalance tokenAddress={tokenOut} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                {/* 代币选择器：允许用户选择输出代币 */}
                <TokenSelector selectedToken={tokenOut} onSelect={setTokenOut} />
              </div>
              <div className="flex-1">
                {/* 
                  金额输入/显示框：
                  - 在ExactInput模式下：显示计算出的输出金额（只读）
                  - 在ExactOutput模式下：允许用户输入期望的输出金额
                  - onChange: 用户输入时更新amountOut，并切换到ExactOutput模式
                  - disabled: 在ExactInput模式且正在计算价格时禁用
                */}
                <Input
                  type="number"
                  placeholder="0.0"
                  value={amountOut}
                  onChange={(e) => {
                    setAmountOut(e.target.value);
                    setIsExactInput(false); // 输入时自动切换到ExactOutput模式
                  }}
                  disabled={isExactInput && isQuoteLoading} // ExactInput模式下，计算价格时禁用
                  className="text-right text-lg"
                />
              </div>
            </div>
            {/* 价格计算状态提示 */}
            {/* 正在计算价格时显示"计算中..." */}
            {isQuoteLoading && (amountIn || amountOut) && (
              <p className="text-xs text-muted-foreground text-center">计算中...</p>
            )}
            {/* 价格计算失败时显示错误信息 */}
            {quoteError && (
              <p className="text-xs text-red-500 text-center">
                价格计算失败，请检查池子是否有足够的流动性
              </p>
            )}
          </div>

          {/* ========== 分隔线 ========== */}
          <Separator />

          {/* ========== 池子信息显示 ========== */}
          {/* 
            显示当前选择的流动性池信息：
            - 路由信息：显示使用了多少个池子（目前只支持单池，但代码支持多跳扩展）
            - 池子详情：显示池子索引、流动性、费率
            - 流动性格式化：如果流动性值很大（超过10位），只显示前10位
            
            显示条件：
            - indexPath.length > 0: 必须找到可用的池子
            - calculatedIndexPath.length > 0: 计算出的路径有效
          */}
          {indexPath.length > 0 && calculatedIndexPath.length > 0 && (
            <div className="text-xs text-muted-foreground space-y-1">
              <div>
                路由: 使用 {indexPath.length} 个池子
              </div>
              {/* 
                查找并显示选中的池子详细信息：
                - 通过calculatedIndexPath[0]找到对应的池子
                - 显示池子索引、流动性、费率
                - 流动性值如果太大，进行截断显示
              */}
              {pools.length > 0 && (() => {
                const selectedPool = pools.find(p => p.index === calculatedIndexPath[0]);
                if (selectedPool) {
                  console.log(selectedPool,'selectedPool');
                  // 流动性格式化：流动性值通常很大，使用科学计数法或简单格式化
                  const liquidityStr = selectedPool.liquidity.toString();
                  const liquidityDisplay = liquidityStr.length > 10 
                    ? `${liquidityStr.slice(0, 10)}...` // 超过10位时截断
                    : formatTokenAmount(selectedPool.liquidity, 0); // 流动性没有小数位
                  
                  return (
                    <div className="text-xs">
                      池子信息: Index {selectedPool.index.toString()} | 
                      流动性: {liquidityDisplay} | 
                      费率: {formatFee(selectedPool.fee)}
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {/* ========== Swap执行按钮 ========== */}
          {/* 
            主交换/授权按钮：
            - onClick: 点击时调用handleSwap函数，会自动检查授权并执行相应操作
            - disabled: 按钮禁用条件（任一满足即禁用）:
              * !canSwap: 不满足交换条件（未选择代币、无金额等）
              * isApproving: 正在等待用户确认授权交易（钱包弹窗中）
              * isApproveConfirming: 授权交易已提交，正在等待区块链确认
              * isSwapPending: 正在等待用户确认swap交易（钱包弹窗中）
              * isConfirming: swap交易已提交，正在等待区块链确认
              * isQuoteLoading: 正在计算价格（避免在价格未确定时执行）
              * isAllowanceLoading: 正在加载授权额度
            
            按钮文本状态：
            - "授权中...": 正在授权（isApproving || isApproveConfirming）
            - "交易中...": 正在执行swap（isSwapPending || isConfirming）
            - "输入金额": 不满足交换条件（!canSwap）
            - "授权 [代币符号]": 需要授权（needsApproval）
            - "Swap": 可以执行交换
            
            - className="w-full": 全宽按钮，占据整行
            
            工作流程：
            1. 用户点击按钮
            2. handleSwap检查是否需要授权
            3. 如果需要授权，先执行授权操作
            4. 授权成功后，自动执行swap（通过useEffect）
            5. 如果不需要授权，直接执行swap
          */}
          <Button
            onClick={handleSwap}
            disabled={isButtonDisabled}
            className="w-full"
          >
            {getButtonText()}
          </Button>

          {/* ========== 路由信息（底部） ========== */}
          {/* 
            底部路由信息显示（与上方的池子信息类似，但更简洁）
            显示条件：indexPath.length > 0（有可用池子）
            
            注意：这里与上方的池子信息显示有重复，可以考虑移除其中一个
          */}
          {indexPath.length > 0 && (
            <div className="text-xs text-muted-foreground">
              路由: 使用 {indexPath.length} 个池子
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

