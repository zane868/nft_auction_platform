# MetaNFT Sepolia 页面

在项目根目录启动：

```bash
python3 -m http.server 8080 --directory frontend
```

访问 http://localhost:8080 。钱包交易使用 MetaMask 的 Ethereum Sepolia 网络。

## 文件

- `index.html`：页面结构与表单。
- `styles.css`：页面样式和手机布局。
- `js/config.js`：NFT、拍卖代理、实现合约和测试 USDC 地址。
- `js/abis.js`：合约接口。
- `js/app.js`：钱包状态、权限、读取和交易逻辑。

修改默认部署地址时编辑 `js/config.js`。页面也支持临时输入其他拍卖代理地址。

## 验证

在项目根目录运行离线回归检查：

```bash
node --test frontend/test/app.test.mjs
```

测试模拟 RPC 和钱包，覆盖权限检查、价格精度、授权和拍卖创建、owner 操作、交易失败以及账户变化；不会发送链上交易。
