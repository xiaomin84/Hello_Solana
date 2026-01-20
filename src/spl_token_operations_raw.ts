import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
  SystemProgram,
} from "@solana/web3.js";
import {
  createInitializeMint2Instruction,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  getAccount,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import { RPC_ENDPOINT, PAYER_KEYPAIR_PATH } from "./config";

/**
 * 加载密钥对
 */
function loadKeypair(path: string): Keypair {
  const secretKeyString = fs.readFileSync(path, "utf8");
  const secretKey = Uint8Array.from(JSON.parse(secretKeyString));
  return Keypair.fromSecretKey(secretKey);
}

/**
 * 带重试的空投函数
 * @param connection Solana 连接
 * @param publicKey 接收空投的公钥
 * @param amount 空投金额（默认 1 SOL）
 * @param maxRetries 最大重试次数（默认 3 次）
 * @returns 交易签名
 */
async function airdropWithRetry(
  connection: Connection,
  publicKey: PublicKey,
  amount: number = 1 * LAMPORTS_PER_SOL,
  maxRetries: number = 3
) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      console.log(`🚀 正在尝试空投 ${amount / LAMPORTS_PER_SOL} SOL (尝试 ${retries + 1}/${maxRetries})...`);

      // 1. 请求空投
      const signature = await connection.requestAirdrop(publicKey, amount);

      // 2. 获取最新的 Blockhash 用于确认
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();

      // 3. 等待确认
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });

      console.log("✅ 空投成功！");
      return signature; // 成功后跳出函数

    } catch (error: any) {
      retries++;

      // 判断是否是限流错误 (429)
      if (error.message.includes("429") || error.message.includes("Too Many Requests")) {
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
 * 使用原始指令创建 Mint 账户
 */
async function createMintRaw(
  connection: Connection,
  payer: Keypair,
  mintAuthority: PublicKey,
  freezeAuthority: PublicKey | null,
  decimals: number
): Promise<PublicKey> {
  // 生成新的密钥对作为 Mint 账户
  const mint = Keypair.generate();

  // 获取 Mint 账户所需的最小租金
  const mintRent = await getMinimumBalanceForRentExemptMint(connection);

  // 创建账户指令
  const createAccountInstruction = SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: mint.publicKey,
    space: MINT_SIZE,
    lamports: mintRent,
    programId: TOKEN_PROGRAM_ID,
  });

  // 初始化 Mint 指令
  const initializeMintInstruction = createInitializeMint2Instruction(
    mint.publicKey, // mint pubkey
    decimals, // decimals
    mintAuthority, // mint authority
    freezeAuthority, // freeze authority
    TOKEN_PROGRAM_ID
  );

  // 创建并发送交易
  const transaction = new Transaction().add(createAccountInstruction, initializeMintInstruction);

  const signature = await sendAndConfirmTransaction(connection, transaction, [payer, mint]);

  console.log(`   Mint 创建交易: ${signature}`);

  return mint.publicKey;
}

/**
 * 使用原始指令创建 Associated Token Account
 */
async function getOrCreateAssociatedTokenAccountRaw(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  owner: PublicKey
): Promise<PublicKey> {
  // 获取 Associated Token Account 地址
  const associatedTokenAccount = await getAssociatedTokenAddress(
    mint, // mint pubkey
    owner, // owner pubkey
    false, // allow owner off-curve
    TOKEN_PROGRAM_ID
  );

  // 检查账户是否已存在
  try {
    const accountInfo = await connection.getAccountInfo(associatedTokenAccount);
    if (accountInfo !== null) {
      console.log("   ATA 账户已存在，跳过创建");
      return associatedTokenAccount;
    }
  } catch (error) {
    // 账户不存在，继续创建
  }

  // 创建 ATA 指令（使用 idempotent 版本，如果已存在不会失败）
  const createAtaInstruction = createAssociatedTokenAccountIdempotentInstruction(
    payer.publicKey, // payer
    associatedTokenAccount, // associated token account address
    owner, // owner
    mint, // mint
    TOKEN_PROGRAM_ID
  );

  // 创建并发送交易
  const transaction = new Transaction().add(createAtaInstruction);

  const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);

  console.log(`   ATA 创建交易: https://explorer.solana.com/tx/${signature}?cluster=devnet`);

  return associatedTokenAccount;
}

/**
 * 使用原始指令铸造 Token
 */
async function mintToRaw(
  connection: Connection,
  payer: Keypair,
  mint: PublicKey,
  destination: PublicKey,
  authority: PublicKey,
  amount: number
): Promise<string> {
  // 创建铸造指令
  const mintToInstruction = createMintToInstruction(
    mint, // mint
    destination, // destination (token account)
    authority, // mint authority
    amount, // amount
    [], // multiSigners (如果 authority 是多重签名账户)
    TOKEN_PROGRAM_ID
  );

  // 创建并发送交易
  const transaction = new Transaction().add(mintToInstruction);

  const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);

  return signature;
}

/**
 * 使用原始指令转账 Token
 */
async function transferRaw(
  connection: Connection,
  payer: Keypair,
  source: PublicKey,
  destination: PublicKey,
  authority: PublicKey,
  amount: number
): Promise<string> {
  // 创建转账指令
  const transferInstruction = createTransferInstruction(
    source, // source (token account)
    destination, // destination (token account)
    authority, // authority (owner of source account)
    amount, // amount
    [], // multiSigners (如果 authority 是多重签名账户)
    TOKEN_PROGRAM_ID
  );

  // 创建并发送交易
  const transaction = new Transaction().add(transferInstruction);

  const signature = await sendAndConfirmTransaction(connection, transaction, [payer]);

  return signature;
}

/**
 * 主函数：演示使用原始指令进行 SPL Token 的发行与转账
 */
async function main() {
  console.log("\n=== SPL Token 发行与转账演示（使用原始指令）===\n");

  // 1. 建立连接
  const connection = new Connection(RPC_ENDPOINT, "confirmed");
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  console.log("✅ 连接到 Solana:", RPC_ENDPOINT);

  // 2. 加载支付者密钥对
  const payer = loadKeypair(PAYER_KEYPAIR_PATH);
  console.log("✅ 支付者地址:", payer.publicKey.toBase58());

  // 检查余额
  const balance = await connection.getBalance(payer.publicKey);
  console.log(`💰 支付者余额: ${balance / 1e9} SOL\n`);

  if (balance < 0.01 * 1e9) {
    console.log("❌ 余额不足，请先充值 SOL");
    // Airdrop 一些 SOL 以便支付手续费
    try {
      await airdropWithRetry(connection, payer.publicKey, 10 * LAMPORTS_PER_SOL);
    } catch (error: any) {
      console.error("\n❌ 支付者空投失败，程序终止");
      console.error(`   错误详情: ${error.message}`);
      console.error(`   支付者地址: ${payer.publicKey.toBase58()}`);
      console.error("   请手动为该地址充值 SOL 后重试");
      process.exit(1);
    }
  }

  // 3. 使用原始指令创建新的 Token Mint
  console.log("📝 正在使用原始指令创建新的 Token Mint...");
  const mint = await createMintRaw(
    connection,
    payer, // 支付交易费用的账户
    payer.publicKey, // Mint Authority（铸币权限）
    payer.publicKey, // Freeze Authority（冻结权限）
    9 // 小数位数 (decimals)
  );
  console.log("✅ Token Mint 地址:", mint.toBase58());

  // 4. 使用原始指令为支付者创建 Token Account
  console.log("📝 正在使用原始指令为支付者创建 Token Account...");
  const payerTokenAccount = await getOrCreateAssociatedTokenAccountRaw(
    connection,
    payer,
    mint,
    payer.publicKey
  );
  console.log("✅ 支付者 Token Account:", payerTokenAccount.toBase58());

  // 查询初始余额
  const payerAccountInfo = await getAccount(connection, payerTokenAccount);
  console.log(`   当前余额: ${payerAccountInfo.amount}\n`);

  // 5. 使用原始指令铸造 Token（发行）
  const mintAmount = 1000 * 1e9; // 1000 个 token (考虑 9 位小数)
  console.log(`📝 正在使用原始指令铸造 ${mintAmount / 1e9} 个 Token...`);
  const mintSignature = await mintToRaw(
    connection,
    payer,
    mint,
    payerTokenAccount,
    payer.publicKey, // Mint Authority
    mintAmount
  );
  console.log("✅ 铸造成功！");
  console.log("   交易签名:", mintSignature);

  // 查询更新后的余额
  const updatedAccount = await getAccount(connection, payerTokenAccount);
  console.log(`   新余额: ${Number(updatedAccount.amount) / 1e9} tokens\n`);

  // 6. 创建接收者账户并转账
  console.log("📝 创建接收者账户...");
  const receiver = Keypair.generate();
  console.log("✅ 接收者地址:", receiver.publicKey.toBase58());

  // 为接收者创建 Token Account
  console.log("📝 使用原始指令为接收者创建 Token Account...");
  const receiverTokenAccount = await getOrCreateAssociatedTokenAccountRaw(
    connection,
    payer,
    mint,
    receiver.publicKey
  );
  console.log("✅ 接收者 Token Account:", receiverTokenAccount.toBase58());

  // 查询接收者初始余额
  const receiverAccountInfo = await getAccount(connection, receiverTokenAccount);
  console.log(`   当前余额: ${receiverAccountInfo.amount}\n`);

  // 7. 使用原始指令转账 Token
  const transferAmount = 100 * 1e9; // 转账 100 个 token
  console.log(`📝 正在使用原始指令转账 ${transferAmount / 1e9} 个 Token...`);
  const transferSignature = await transferRaw(
    connection,
    payer,
    payerTokenAccount,
    receiverTokenAccount,
    payer.publicKey, // Source account owner
    transferAmount
  );
  console.log("✅ 转账成功！");
  console.log("   交易签名:", transferSignature);

  // 8. 查询最终余额
  console.log("\n📊 转账后余额:");
  const finalPayerAccount = await getAccount(connection, payerTokenAccount);
  const finalReceiverAccount = await getAccount(connection, receiverTokenAccount);

  console.log(`   支付者: ${Number(finalPayerAccount.amount) / 1e9} tokens`);
  console.log(`   接收者: ${Number(finalReceiverAccount.amount) / 1e9} tokens`);
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
