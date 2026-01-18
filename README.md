# Hello Solana

[![Solana](https://img.shields.io/badge/Solana-Build-black?logo=solana)](https://solana.com/)

This repository is a curated collection of **useful and relevant scripts, snippets, and tools** for developing on the Solana blockchain.

## 🚀 Overview
Whether you are deploying programs, managing tokens, or interacting with RPCs, this repo provides battle-tested code samples to speed up your workflow.

## 📂 What's Inside?
* **Scripts:** Automation tools for account management and transactions.
* **Code Snippets:** Reusable patterns for Anchor and native Rust development.
* **Examples:** Practical integration examples for web3.js and spl-token.

## 🛠️ Getting Started

### 安装依赖
```bash
npm install
```

### 配置

1. 创建密钥对文件（如果还没有）：
   ```bash
   # 使用 Solana CLI 生成密钥对
   solana-keygen new --outfile keypair.json
   ```

2. 配置 RPC 端点（可选）：
   - 默认使用 devnet: `https://api.devnet.solana.com`
   - 可以通过环境变量 `RPC_ENDPOINT` 修改
   - 或者直接编辑 `src/config.ts`

### 运行

**开发模式（使用 ts-node）：**
```bash
npm run dev
```

**生产模式（先编译再运行）：**
```bash
npm run build
npm start
```

### 项目结构
- `src/spl_token_operations.ts` - SPL Token 操作主程序
- `src/config.ts` - 配置文件
- `package.json` - 项目依赖和脚本
- `tsconfig.json` - TypeScript 配置
