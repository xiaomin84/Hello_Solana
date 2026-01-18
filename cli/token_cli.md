### 创建Token
```
# 生成一个以usd开头靓号的keypair
solana-keygen grind --starts-with usd:1 

# 用keypair文件创建Token
spl-token create-token ~/.config/solana/usd1wGi97zuiKQAvaxPPfCDKnXLPUf2dCfTkwJcAmeX.json

# 创建Token并指定小数位数
spl-token create-token --decimals 6 ~/.config/solana/usd1wGi97zuiKQAvaxPPfCDKnXLPUf2dCfTkwJcAmeX.json

# 创建Token并指定小数位数，并指定网络
spl-token create-token --decimals 6 keypair.json --url http://127.0.0.1:8899
```

最终结果是创建 mint 账户，mint账号保存：
- decimals: 小数位数
- supply：当前总供应量, 创建时为0
- mint_authority: 铸造权限，谁可以发行 token,缺省为当前keypair 
- freeze_authority: 冻结权限：冻结或解冻某个账户的 Token， 防止该账户进行转账或接收 Token，缺省为no set,如果要enable，需要在执行create-token时指定 --enable-freeze,这将把freeze_authority设置为同mint_authority

### 发行
```
# 为当前钱包用户创建ATA账户，缺省Owner为当前钱包用户
spl-token create-account <mint account>

# 为指定ATA账户发行token，当前钱包用户必须有mint authority权限
spl-token mint <mint account> <TOKEN_AMOUNT>  [<ATA_ACCOUNT>]

# 获取某个钱包账户OWNER_ADDRESS对应的ATA Account
spl-token address --verbose --token <TOKEN_MINT_ADDRESS> --owner <OWNER_ADDRESS>

# 关闭 mint 权限 
spl-token authorize <mint account> mint —disable
```

### 查看Token的账户信息

```
# 查看总发行量
spl-token supply <mint account> 

# 查看指定ATA账户的余额
spl-token balance --address <ATA_ACCOUNT>

# 查看当前钱包用户在指定mint account下的余额
spl-token balance <mint account>

# 查看当前钱包账户为Ower的ATA账户信息
spl-token account-info <mint account>

# 查看指定Ower(钱包地址)的ATA账户信息
spl-token account-info <mint account> <owner account>

# 查看指定mint account的详细信息
spl-token display <mint account>

# 查看指定ATA账户的详细信息
spl-token display  < ata account>

# 查看当前钱包账户所有的Token及余额
spl-token accounts
 
```
### 关闭 ATA 账户
```
# 销毁指定ATA账户的token，当前钱包用户必须是Owner
spl-token burn <ATA account> <TOKEN_AMOUNT>

# 关闭当前钱包的余额为0的ATA账户
spl-token close <mint_account>
```

### 转账
```
# 转账指定金额的token到指定ATA账户
# 如果提供的是wallet地址,则转入其对应的ATA账户
# 加--fund-recipient，不存在对应ATA账户，则自动创建 
spl-token transfer <mint account>  <TOKEN_AMOUNT> <RECIPIENT_WALLET_ADDRESS or RECIPIENT_TOKEN_ACCOUNT_ADDRESS>
```

### 创建NFT
NFT 是一个特殊的 TOKEN， 他们使用同一个程序， decimals 为 0，每次 mint 一个

```
# 每个NFT需要有一个独立的 mint 账户
spl-token create-token --decimals 0

# 用Token2022创建有metadata的NFT
spl-token create-token --enable-metadata --decimals 0 --program-2022

spl-token initialize-metadata <mint account> NAME Symbol https://raw.githubusercontent.com/lbc-team/hello_gill/refs/heads/main/metadata/nft-metadata.json

spl-token mint <mint account> 1  <ATA_ACCOUNT>
```