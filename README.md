# MetaNodeSwap DApp

MetaNodeSwap 去中心化交易所前端应用

## 技术栈

- **框架**: Next.js 15
- **Web3**: Wagmi + RainbowKit
- **UI**: Tailwind CSS + shadcn/ui (组件库)
- **网络**: Sepolia测试网

## UI组件库

本项目使用 [shadcn/ui](https://ui.shadcn.com/) 作为UI组件库。

### 已安装的组件

- Button (`@/components/ui/button`)
- Card (`@/components/ui/card`)
- Dialog (`@/components/ui/dialog`)
- Input (`@/components/ui/input`)
- Separator (`@/components/ui/separator`)
- Tabs (`@/components/ui/tabs`)
- Toast (`@/components/ui/toast`)

### 添加更多组件

如果需要添加更多 shadcn/ui 组件，可以使用 CLI：

```bash
npx shadcn@latest add [component-name]
```

例如：
```bash
npx shadcn@latest add select
npx shadcn@latest add dropdown-menu
```

配置文件已保存在 `components.json`，可以直接使用。

## 功能

- **Swap**: 代币交换功能，支持精确输入和精确输出
- **Pool**: 池子管理，创建和查看交易池
- **Position**: 流动性管理，添加/移除流动性，提取手续费

## 安装和运行

1. 安装依赖：
```bash
npm install
# 或
pnpm install
```

2. 配置环境变量：
创建 `.env.local` 文件：
```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id
NEXT_PUBLIC_RPC_URL=https://sepolia.infura.io/v3/your_key
```

3. 运行开发服务器：
```bash
npm run dev
# 或
pnpm dev
```

4. 打开浏览器访问 `http://localhost:3000`

## 合约地址 (Sepolia)

- **PoolManager**: `0xddC12b3F9F7C91C79DA7433D8d212FB78d609f7B`
- **PositionManager**: `0xbe766Bf20eFfe431829C5d5a2744865974A0B610`
- **SwapRouter**: `0xD2c220143F5784b3bD84ae12747d97C8A36CeCB2`

## 测试代币

- **MNTokenA**: `0x4798388e3adE569570Df626040F07DF71135C48E`
- **MNTokenB**: `0x5A4eA3a013D42Cfd1B1609d19f6eA998EeE06D30`
- **MNTokenC**: `0x86B5df6FF459854ca91318274E47F4eEE245CF28`
- **MNTokenD**: `0x7af86B1034AC4C925Ef5C3F637D1092310d83F03`

## 项目结构

```
src/
├── app/              # Next.js页面
│   ├── page.tsx      # Swap页面
│   ├── pool/         # Pool页面
│   └── position/     # Position页面
├── components/        # React组件
│   ├── layout/       # 布局组件
│   ├── token/        # 代币相关组件
│   └── ui/           # UI基础组件
├── hooks/            # 自定义Hooks
├── lib/              # 工具函数和配置
│   ├── contracts/    # 合约配置（地址、ABI、类型）
│   └── utils/        # 工具函数
```

## 注意事项

- 添加流动性（mint）时，价格范围由选择的池子决定，不需要用户指定tick lower和tick upper
- 所有代币操作前需要先进行授权（approve）
- Swap时需要选择匹配的池子路径（indexPath）

