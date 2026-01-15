


### 生成新的密钥对:

```
solana-keygen new --outfile ~/.config/solana/wallet_account_id.json

# 磨号(Grinding)
# 通过暴力破解的方式，生成一个以特定字符开头/结尾的特定钱包地址（俗称“靓号”）
# 注意：当你运行完这个命令，它会在当前目录下生成一个名为 tinyXXXX...json 的文件，这就是你的靓号钱包地址

solana-keygen grind --starts-with tiny:1
solana-keygen grind --ends-with tiny:1

```

---

⚠️⚠️⚠️ 安全提醒 ⚠️⚠️⚠️

> **🚨 重要警告：无论你用哪种方式生成，请务必注意以下安全事项！**

> **助记词（Seed Phrase）**  
> 执行命令后，终端会显示 12 或 24 个单词。这是找回钱包的唯一凭证，务必手抄记录，不要截图或存入联网的备忘录。

> **.json 文件**  
> 这个文件就是你的私钥。如果你要把代码上传到 GitHub，千万不要把这个 .json 文件一起传上去！

---

### 查看钱包地址：

```
# 查看当前钱包地址
solana address

# 查看指定钱包地址
solana address -k ~/.config/solana/wallet_account_id.json
solana address -k ~/.config/solana/tinyXXXX...json

# 切换当前钱包地址
solana config set --keypair ~/.config/solana/wallet_account_id.json
```

### 查看与设置网络：

```
# 查看当前网络
solana config get

# devnet: https://api.devnet.solana.com
solana config set --url devnet

# mainnet-beta: https://api.mainnet-beta.solana.com 
solana config set --url mainnet-beta

# localhost: http://localhost:8899
solana config set --url localhost 

# devnet(example): helius: https://devnet.helius-rpc.com/?api-key=4114aeed-18a7-4c53-a71c-325ed42823a4

solana config set --url https://devnet.helius-rpc.com/?api-key=4114aeed-18a7-4c53-a71c-325ed42823a4

```
---

> **关于RPC节点**  
> 内置RPC节点经常工作不正常，可以参考https://solana.com/zh/rpc 文档，申请一个第三方节点服务.
>
> Macbook Intel CPU 用户可能会遇到 HTTP status client error (400 Bad Request) 错误，
> [原因及解决方案](https://github.com/anza-xyz/agave/issues/8134)
---

### 查看余额：
```
solana balance
solana balance <ACCOUNT_ADDRESS> --url https://api.devnet.solana.com
solana balance -k my.json
```


### 水龙头： https://faucet.solana.com/
```
solana airdrop 5
solana airdrop 1 <RECIPIENT_ACCOUNT_ADDRESS> --url https://api.devnet.solana.com
```

### 发送 SOL：

```
solana transfer --from <KEYPAIR> <RECIPIENT_ACCOUNT_ADDRESS> <AMOUNT> --fee-payer <KEYPAIR>

# --allow-unfunded-recipient  允许向未创建账户的地址发送SOL 
solana transfer --allow-unfunded-recipient --from ~/.config/solana/id.json 8gwAbvN8t7n7PoTqWhuqPJ7s4Vgov1YNPByMBJavgHJt 1 --fee-payer ~/.config/solana/id.json 

```

