# Time Translator

一个元气100%的 Chrome / Edge Manifest V3 浏览器插件：选中英文时间表达，弹出普通人能读懂的目标时区时间。

品牌标语：**元气100%**，轻松读懂时区。

## 当前版本

- Popup 支持日间/夜间模式，偏好会自动保存
- 插件 Popup 内可开关“选中后自动检测并转换”；关闭后只保留右键菜单手动检测
- 默认目标时区 `Asia/Shanghai`
- Popup 可添加自定义触发词或短语，匹配不区分大小写
- 解析统一使用在线模型；没有 API Key 时会明确提示配置，不会静默切换到本地规则
- 处理 `today / tomorrow / next Monday`、12/24 小时制、`before / by / after / between`
- 使用 IANA 时区规则自动处理英国、美国等地区的夏令时和冬令时
- 支持在线 LLM 解析：DeepSeek、小米 MiMo、通义千问、智谱 GLM、Kimi、豆包、OpenAI-compatible 自定义接口
- 模型名支持点击刷新，从当前服务商的 `/models` 接口读取动态候选；接口不支持时仍可手动填写
- 插件 Popup 内包含模型配置、转换偏好和在线测试

## 本地开发

```bash
npm test
npm run build
```

启动测试页面：

```bash
python3 -m http.server 8788
```

然后打开 `http://localhost:8788/test-page.html`，选中页面中的英文表达。

加载插件：

1. 打开 `chrome://extensions`
2. 开启“开发者模式”
3. 点击“加载已解压的扩展程序”
4. 选择项目根目录，或选择 `dist/` 目录

开发时直接选择项目根目录，修改文件后点击扩展卡片的刷新按钮即可。

## 配置在线模型

点击扩展图标，在 Popup 内选择服务商、填写 API Key；模型名可以手动填写，也可以点击旁边的刷新按钮从服务商动态读取。输入和选项会自动保存。

在线模型 Endpoint 必须使用 HTTPS。选中文本只在发起转换时发送到用户选择的模型服务商，不发送整页内容。刷新模型列表时，会向当前 Endpoint 推导出的 `/models` 地址发送带 API Key 的请求，不会发送选中的网页文本。

隐私政策见 [`privacy-policy.html`](./privacy-policy.html)。

API Key、自动检测开关和自定义触发词使用 `chrome.storage.local` 保存。开启自动检测时，在线模型只接收通过本地时间候选检查的用户选中文本；关闭自动检测后，只有右键菜单会发起检测。没有 API Key 或在线请求失败时，会显示明确原因。

自定义触发词在 Popup 的“转换偏好”中每行填写一个，也支持逗号或分号分隔；空格会保留为短语，匹配不区分大小写，最多保存 30 个、每个不超过 60 个字符。命中后仍需完成鼠标选择并释放，才会发起解析。

流程是“本地候选检查 → LLM 输出规范化当地时间 JSON → 本地 IANA 时区规则换算”。LLM 会根据插件传入的参考时刻解析 `today` 等相对日期，但不直接计算北京时间。

在线模型的 `source_time_zone` 只接受规范化 IANA 时区标识，例如 `Europe/London`、`America/New_York`、`Asia/Shanghai`、`UTC`。插件会统一大小写并将少量 IANA 别名归一化；`CST`、`BST`、`UTC+08:00` 等缩写或固定偏移不会放进这个字段。固定偏移直接从原文中由插件提取并解析成内部分钟数，LLM 不参与这一步；原文包含固定偏移时，也不允许模型返回 IANA 时区。

火山方舟需要把模型名替换成你自己的 Endpoint ID；阿里云百炼也可以使用业务空间专属 Endpoint。

## 测试边界

本项目的核心测试 seam 是：

- `parseEnglishTimeExpression()`：英文表达解析
- `parseStructuredTimeExpression()`：LLM 结构化结果解析
- `resolveLocalDateTime()` / `formatBeijingDateTime()`：IANA 时区转换和普通中文展示
- `requestOpenAICompatibleExtraction()`：兼容接口适配

时间转换最终由程序和 IANA 时区数据库完成，LLM 只负责理解英文语义。
