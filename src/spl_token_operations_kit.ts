import {
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  sendAndConfirmTransactionFactory,
  generateKeyPairSigner,
  createKeyPairSignerFromBytes,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  getSignatureFromTransaction,
  isSolanaError,
  SOLANA_ERROR__BLOCK_HEIGHT_EXCEEDED,
} from "@solana/kit";
import {
  getCreateAccountInstruction,
} from "@solana-program/system";
import {
  getMintSize,
  TOKEN_PROGRAM_ADDRESS,
  getInitializeMintInstruction,
  getMintToInstruction,
  getTransferInstruction,
  findAssociatedTokenPda,
  getCreateAssociatedTokenInstructionAsync,
} from "@solana-program/token";
import * as fs from "fs";
import { RPC_ENDPOINT, PAYER_KEYPAIR_PATH } from "./config";

/**
 * 加载密钥对（转换为 Solana Kit 格式）
 */
async function loadKeypairSigner(path: string) {
  const secretKeyString = fs.readFileSync(path, "utf8");
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return await createKeyPairSignerFromBytes(secretKey);
}

/**
 * 带重试的空投函数
 * @param rpc RPC 客户端
 * @param publicKey 接收空投的公钥
 * @param amount 空投金额（默认 1 SOL）
 * @param maxRetries 最大重试次数（默认 3 次）
 * @returns 交易签名
 */
async function airdropWithRetry(
  rpc: any,
  publicKey: any,
  amount: bigint = BigInt(1_000_000_000), // 1 SOL
  maxRetries: number = 3
) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const solAmount = Number(amount) / 1_000_000_000;
      console.log(
        `🚀 正在尝试空投 ${solAmount} SOL (尝试 ${retries + 1}/${maxRetries})...`
      );

      // 1. 请求空投
      const signature = await rpc.requestAirdrop(publicKey, amount).send();

      // 2. 等待确认（简单轮询）
      let confirmed = false;
      for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          const status = await rpc.getSignatureStatuses([signature]).send();
          if (
            status.value[0]?.confirmationStatus === "confirmed" ||
            status.value[0]?.confirmationStatus === "finalized"
          ) {
            confirmed = true;
            break;
          }
        } catch (e) {
          // 继续等待
        }
      }

      if (!confirmed) {
        throw new Error("空投确认超时");
      }

      console.log("✅ 空投成功！");
      return signature;
    } catch (error: any) {
      retries++;

      // 判断是否是限流错误 (429)
      if (
        error.message?.includes("429") ||
        error.message?.includes("Too Many Requests")
      ) {
        const waitTime = Math.pow(2, retries) * 1000; // 2s, 4s, 8s...
        console.warn(`⚠️ 触发限流，等待 ${waitTime / 1000} 秒后重试...`);
        await new Promise((res) => setTimeout(res, waitTime));
      } else if (retries >= maxRetries) {
        console.error("❌ 达到最大重试次数，空投失败。");
        throw error;
      } else {
        console.warn(`🔄 发生错误: ${error.message}，正在重试...`);
      }
    }
  }
}

/**
 * 获取 Token 账户余额
 */
async function getTokenBalance(
  rpc: any,
  tokenAccountAddress: any
): Promise<bigint> {
  try {
    const response = await rpc
      .getTokenAccountBalance(tokenAccountAddress)
      .send();
    if (response.value) {
      return BigInt(response.value.amount);
    }
    return BigInt(0);
  } catch (error) {
    // 账户不存在或出错，返回 0
    return BigInt(0);
  }
}

/**
 * 检查账户是否存在
 */
async function accountExists(rpc: any, address: any): Promise<boolean> {
  try {
    const accountInfo = await rpc.getAccountInfo(address).send();
    return accountInfo.value !== null;
  } catch (error) {
    return false;
  }
}

/**
 * 发送并确认交易（使用 Solana Kit 方式）
 */
async function sendAndConfirmTransaction(
  sendAndConfirmFn: any,
  instructions: any[],
  feePayer: any,
  additionalSigners: any[] = []
) {
  const rpc = createSolanaRpc(RPC_ENDPOINT);

  // 获取最新的 blockhash
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();

  // 构建交易消息
  const txMessage = await createTransactionMessage({ version: 0 });
  const messageWithFeePayer = setTransactionMessageFeePayerSigner(
    feePayer,
    txMessage
  );
  const messageWithLifetime = setTransactionMessageLifetimeUsingBlockhash(
    latestBlockhash,
    messageWithFeePayer
  );
  const finalMessage = appendTransactionMessageInstructions(
    instructions,
    messageWithLifetime
  );

  // 签名交易
  // signTransactionMessageWithSigners 会自动从交易消息中提取所有 signers
  // signers 已经通过 setTransactionMessageFeePayerSigner 和指令中的账户元数据附加
  const signedTx = await signTransactionMessageWithSigners(finalMessage);

  // 发送并确认
  try {
    await sendAndConfirmFn(signedTx, { commitment: "confirmed" });
    return getSignatureFromTransaction(signedTx);
  } catch (e) {
    if (isSolanaError(e, SOLANA_ERROR__BLOCK_HEIGHT_EXCEEDED)) {
      throw new Error("Blockhash expired — transaction lifetime exceeded");
    } else {
      throw e;
    }
  }
}

/**
 * 将 HTTP URL 转换为 WebSocket URL
 * @param httpUrl HTTP/HTTPS URL
 * @returns WebSocket URL (ws:// 或 wss://)
 */
function convertHttpToWebSocketUrl(httpUrl: string): string {
  if (httpUrl.startsWith("https://")) {
    return httpUrl.replace("https://", "wss://");
  } else if (httpUrl.startsWith("http://")) {
    // 对于本地节点，WebSocket 通常在 8900 端口
    if (httpUrl.includes("localhost:8899") || httpUrl.includes("127.0.0.1:8899")) {
      return httpUrl.replace("http://", "ws://").replace(":8899", ":8900");
    }
    return httpUrl.replace("http://", "ws://");
  }
  // 如果已经是 WebSocket URL，直接返回
  if (httpUrl.startsWith("wss://") || httpUrl.startsWith("ws://")) {
    return httpUrl;
  }
  // 默认使用 wss://
  return `wss://${httpUrl}`;
}

/**
 * 主函数：演示 SPL Token 的发行与转账（使用 Solana Kit SDK）
 */
async function main() {
  console.log("\n=== SPL Token 发行与转账演示 (Solana Kit SDK) ===\n");

  // 1. 建立 RPC 连接
  const rpc = createSolanaRpc(RPC_ENDPOINT);
  const wsUrl = convertHttpToWebSocketUrl(RPC_ENDPOINT);
  const rpcSubscriptions = createSolanaRpcSubscriptions(wsUrl);
  const sendAndConfirm = sendAndConfirmTransactionFactory({
    rpc,
    rpcSubscriptions,
  });
  console.log("✅ 连接到 Solana:", RPC_ENDPOINT);

  // 2. 加载支付者密钥对
  const payer = await loadKeypairSigner(PAYER_KEYPAIR_PATH);
  console.log("✅ 支付者地址:", payer.address);

  // 检查余额
  const balanceResponse = await rpc.getBalance(payer.address).send();
  const balance = Number(balanceResponse.value);
  console.log(`💰 支付者余额: ${balance / 1e9} SOL\n`);

  if (balance < 0.01 * 1e9) {
    console.log("❌ 余额不足，请先充值 SOL");
    // Airdrop 一些 SOL 以便支付手续费
    try {
      await airdropWithRetry(rpc, payer.address, BigInt(10 * 1_000_000_000));
      // 重新获取余额
      const newBalanceResponse = await rpc.getBalance(payer.address).send();
      const newBalance = Number(newBalanceResponse.value);
      console.log(`💰 空投后余额: ${newBalance / 1e9} SOL\n`);
      if (newBalance < 0.01 * 1e9) {
        throw new Error("空投后余额仍然不足");
      }
    } catch (error: any) {
      console.error("\n❌ 支付者空投失败，程序终止");
      console.error(`   错误详情: ${error.message}`);
      console.error(`   支付者地址: ${payer.address}`);
      console.error("   请手动为该地址充值 SOL 后重试");
      process.exit(1);
    }
  }

  // 3. 创建新的 Token Mint
  console.log("📝 正在创建新的 Token Mint...");
  const mintKeypair = await generateKeyPairSigner();

  // 计算 Mint 账户所需的最小余额（租金豁免）
  const mintSize = getMintSize();
  const rentLamportsResponse = await rpc
    .getMinimumBalanceForRentExemption(BigInt(mintSize))
    .send();
  // rentLamportsResponse 是 Lamports 类型（bigint），直接使用
  const rentLamports = rentLamportsResponse;

  // 构建创建账户和初始化 Mint 的指令
  const createAccountIx = getCreateAccountInstruction({
    payer: payer,
    newAccount: mintKeypair,
    space: mintSize,
    lamports: rentLamports,
    programAddress: TOKEN_PROGRAM_ADDRESS,
  });

  const initializeMintIx = getInitializeMintInstruction({
    mint: mintKeypair.address,
    decimals: 9,
    mintAuthority: payer.address,
    freezeAuthority: payer.address,
  });

  // 发送交易创建 Mint
  const mintTxSignature = await sendAndConfirmTransaction(
    sendAndConfirm,
    [createAccountIx, initializeMintIx],
    payer,
    [mintKeypair]
  );
  console.log("✅ Token Mint 地址:", mintKeypair.address);
  console.log("   交易签名:", mintTxSignature);

  // 4. 为支付者创建 Token Account (ATA)
  console.log("📝 正在为支付者创建 Token Account (ATA)...");
  const [payerTokenAccountAddress] = await findAssociatedTokenPda({
    mint: mintKeypair.address,
    owner: payer.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  // 检查账户是否存在，如果不存在则创建
  if (!(await accountExists(rpc, payerTokenAccountAddress))) {
    // 使用 createAssociatedTokenAccount 指令
    try {
      const createAtaIx = await getCreateAssociatedTokenInstructionAsync({
        payer: payer.address as any,
        owner: payer.address as any,
        mint: mintKeypair.address,
      });
      await sendAndConfirmTransaction(sendAndConfirm, [createAtaIx], payer, []);
      console.log("✅ 已创建支付者 ATA 账户");
    } catch (error: any) {
      // 如果 getCreateAssociatedTokenInstructionAsync 失败，说明 API 可能不可用
      // 这种情况下，我们无法创建 ATA，因为 ATA 必须通过 Associated Token Program 创建
      console.error("❌ 无法创建 ATA 账户，Associated Token Program API 不可用");
      throw error;
    }
  } else {
    console.log("✅ 支付者 ATA 账户已存在");
  }

  // 查询支付者 Token 账户余额
  const payerTokenBalance = await getTokenBalance(rpc, payerTokenAccountAddress);
  console.log("✅ 支付者 Token Account:", payerTokenAccountAddress);
  console.log(`   当前余额: ${Number(payerTokenBalance) / 1e9} tokens\n`);

  // 5. 铸造 Token（发行）
  const mintAmount = BigInt(1000 * 1e9); // 1000 个 token (考虑 9 位小数)
  console.log(`📝 正在铸造 ${Number(mintAmount) / 1e9} 个 Token...`);
  // 根据 API，getMintToInstruction 接受一个输入对象
  const mintToIx = getMintToInstruction({
    mint: mintKeypair.address,
    mintAuthority: payer.address,
    token: payerTokenAccountAddress,
    amount: mintAmount,
  });

  const mintToSignature = await sendAndConfirmTransaction(
    sendAndConfirm,
    [mintToIx],
    payer,
    []
  );
  console.log("✅ 铸造成功！");
  console.log("   交易签名:", mintToSignature);

  // 查询更新后的余额
  const updatedBalance = await getTokenBalance(rpc, payerTokenAccountAddress);
  console.log(`   新余额: ${Number(updatedBalance) / 1e9} tokens\n`);

  // 6. 创建接收者账户并转账
  console.log("📝 创建接收者账户...");
  const receiver = await generateKeyPairSigner();
  console.log("✅ 接收者地址:", receiver.address);

  // 为接收者创建 Token Account (ATA)
  console.log("📝 为接收者创建 Token Account (ATA)...");
  const [receiverTokenAccountAddress] = await findAssociatedTokenPda({
    mint: mintKeypair.address,
    owner: receiver.address,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  // 检查账户是否存在，如果不存在则创建
  if (!(await accountExists(rpc, receiverTokenAccountAddress))) {
    try {
      const createReceiverAtaIx = await getCreateAssociatedTokenInstructionAsync(
        {
          payer: payer.address as any,
          owner: receiver.address as any,
          mint: mintKeypair.address,
        }
      );
      await sendAndConfirmTransaction(
        sendAndConfirm,
        [createReceiverAtaIx],
        payer,
        []
      );
      console.log("✅ 已创建接收者 ATA 账户");
    } catch (error: any) {
      // 如果 getCreateAssociatedTokenInstructionAsync 失败，说明 API 可能不可用
      // 这种情况下，我们无法创建 ATA，因为 ATA 必须通过 Associated Token Program 创建
      console.error("❌ 无法创建接收者 ATA 账户，Associated Token Program API 不可用");
      throw error;
    }
  } else {
    console.log("✅ 接收者 ATA 账户已存在");
  }

  // 查询接收者 Token 账户余额
  const receiverTokenBalance = await getTokenBalance(
    rpc,
    receiverTokenAccountAddress
  );
  console.log("✅ 接收者 Token Account:", receiverTokenAccountAddress);
  console.log(`   当前余额: ${Number(receiverTokenBalance) / 1e9} tokens\n`);

  // 7. 转账 Token
  const transferAmount = BigInt(100 * 1e9); // 转账 100 个 token
  console.log(`📝 正在转账 ${Number(transferAmount) / 1e9} 个 Token...`);
  // 根据 API，getTransferInstruction 接受一个输入对象
  const transferIx = getTransferInstruction({
    source: payerTokenAccountAddress,
    destination: receiverTokenAccountAddress,
    authority: payer.address,
    amount: transferAmount,
  });

  const transferSignature = await sendAndConfirmTransaction(
    sendAndConfirm,
    [transferIx],
    payer,
    []
  );
  console.log("✅ 转账成功！");
  console.log("   交易签名:", transferSignature);

  // 8. 查询最终余额
  console.log("\n📊 转账后余额:");
  const finalPayerBalance = await getTokenBalance(
    rpc,
    payerTokenAccountAddress
  );
  const finalReceiverBalance = await getTokenBalance(
    rpc,
    receiverTokenAccountAddress
  );

  console.log(`   支付者: ${Number(finalPayerBalance) / 1e9} tokens`);
  console.log(`   接收者: ${Number(finalReceiverBalance) / 1e9} tokens`);
}

// 执行主函数
main()
  .then(() => {
    console.log("\n✅ 程序执行成功");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ 发生错误:", error);
    process.exit(1);
  });
