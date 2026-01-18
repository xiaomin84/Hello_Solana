/**
 * 配置文件
 * 从 .env 文件加载环境变量
 */
import dotenv from "dotenv";

// 加载 .env 文件
dotenv.config();

// Solana RPC 端点
// 可以使用公共端点或你自己的 RPC 节点
// 支持的网络: devnet, testnet, mainnet-beta
export const RPC_ENDPOINT = process.env.RPC_ENDPOINT || "https://api.devnet.solana.com";

// 支付者密钥对文件路径
// 密钥对文件应该是一个 JSON 数组，包含私钥的字节数组
// 例如: [123,45,67,...]
export const PAYER_KEYPAIR_PATH = process.env.PAYER_KEYPAIR_PATH || "./keypair.json";
