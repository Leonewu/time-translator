# 浏览器插件用于英文时间表达解析的 LLM 兜底模型推荐

研究日期：2026-08-20

## 结论先行

推荐把 LLM 限定为“语义抽取兜底”，而不是时间换算器：模型只输出日期表达、时间表达、关系词和时区线索；真正的夏令时、跨日和北京时间换算由后端或插件中的 IANA 时区库完成。

如果第一版只选一个在线模型，建议从 **OpenAI `gpt-5.4-nano`** 开始：它明确面向高并发的分类、数据抽取和低成本场景，支持 Structured Outputs，标准价格为每百万输入 token $0.20、输出 token $1.25。这个场景的输入短、输出短、规则边界清晰，符合它的定位。[OpenAI 模型页](https://developers.openai.com/api/docs/models/gpt-5.4-nano)

同时建议做一个 **Google `gemini-3.5-flash-lite`** 适配器作为备选：它是当前 GA 的低延迟、高吞吐轻量模型，支持结构化输出，标准价格为每百万输入 token $0.30、输出 token $2.50；如果对英语口语化表达的评测优于 nano，可以直接切换。[Gemini 模型页](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite) [Gemini 价格页](https://ai.google.dev/gemini-api/docs/pricing)

**Anthropic `claude-haiku-4-5`** 适合作为质量优先或复杂歧义的升级选项。官方将其定位为最快、接近前沿能力的模型，且支持 JSON Schema structured outputs；但价格是每百万输入 token $1、输出 token $5，明显高于前两者。[Claude 模型总览](https://platform.claude.com/docs/en/about-claude/models/overview) [Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

本次没有把聚合平台或其他厂商列入主候选：三家一方 API 已覆盖本场景所需的低延迟、低成本和结构化输出能力，直接接入也更容易控制密钥、数据处理、限流和故障边界。

## 场景定义与选型标准

插件只把用户主动选中的文本发送给在线模型，例如：

```text
today before 3 pm UK
```

模型需要抽取：

```json
{
  "status": "parsed",
  "date_expression": "today",
  "time_expression": "3 pm",
  "relation": "before",
  "timezone_mention": "UK",
  "source_timezone": "Europe/London",
  "confidence": 0.98,
  "ambiguities": [],
  "assumptions": ["today 按源时区日期解释"]
}
```

之后由确定性代码完成：

```text
Europe/London 当地日期和时间
        ↓
IANA 时区库处理 GMT/BST
        ↓
Asia/Shanghai 北京时间
```

选型标准按优先级排列为：

1. 是否支持严格 JSON Schema，而不只是“尽量输出 JSON”。
2. 短文本交互的延迟和高频调用成本。
3. 对英语口语化表达、模糊日期和时区别名的抽取能力。
4. 是否能稳定使用固定模型 ID，并便于服务端做超时、限流、重试和供应商切换。

厂商官方资料没有给出这个具体插件场景的统一 p50/p95 延迟或准确率，因此下文的“快/低延迟”是厂商定位或模型档案中的相对描述，不是跨厂商实测结论。

## 候选模型比较

| 模型 | 官方定位与状态 | 结构化输出 | 标准价格（每 1M token） | 适合本插件的判断 |
|---|---|---|---:|---|
| **OpenAI `gpt-5.4-nano`** | 当前 API 模型；面向速度、成本、分类和数据抽取 | 支持 Structured Outputs / JSON Schema | 输入 $0.20；输出 $1.25 | **默认推荐**：成本最低，定位最贴近“短文本字段抽取” |
| **Google `gemini-3.5-flash-lite`** | 当前 GA；低延迟、高吞吐、低成本，支持简单数据处理 | 支持 `response_format` + JSON Schema 子集 | 输入 $0.30；输出 $2.50 | **强备选**：轻量任务定位清晰，便于做第二供应商 |
| **Anthropic `claude-haiku-4-5`** | 当前模型；最快、接近前沿能力 | 支持 `output_config.format` + JSON Schema | 输入 $1；输出 $5 | **质量升级**：复杂口语、歧义表达值得评测，但成本较高 |
| OpenAI `gpt-5.4-mini` | 当前 API 模型；比 nano 更强的 mini，仍支持结构化输出 | 支持 Structured Outputs / JSON Schema | 输入 $0.75；输出 $4.50 | 适合作为 OpenAI 内部的低置信度升级，不建议第一层默认使用 |

### 1. OpenAI `gpt-5.4-nano`

官方模型页把它描述为“最便宜的 GPT-5.4 级模型”，并明确面向分类、数据抽取、排序和 sub-agent；支持 `reasoning.effort` 的 `none`、`low`、`medium`、`high`、`xhigh`。本插件第一层建议使用 `reasoning.effort: "none"`，把延迟和成本控制在可预测范围内。[模型页](https://developers.openai.com/api/docs/models/gpt-5.4-nano)

OpenAI Structured Outputs 会要求响应匹配给定 JSON Schema，并支持通过 Responses API 的 `text.format` 配置 `type: "json_schema"`。相比旧的 JSON mode，JSON Schema 能约束必填字段和枚举值；仍需要处理拒答、达到 token 上限导致的截断以及语义错误。[Structured Outputs 指南](https://developers.openai.com/api/docs/guides/structured-outputs)

推荐调用形态：

```ts
const response = await openai.responses.create({
  model: "gpt-5.4-nano",
  reasoning: { effort: "none" },
  input: [{ role: "user", content: selectedText }],
  text: {
    format: {
      type: "json_schema",
      name: "time_expression",
      strict: true,
      schema: timeExpressionSchema
    }
  }
});
```

限制和注意点：

- Structured Outputs 保证的是输出形状，不保证 `Europe/London`、日期基准或 `before` 的语义一定正确；仍要做 IANA 时区白名单、日期范围和关系词校验。
- OpenAI 文档要求 Structured Outputs 的字段设为 `required`；可选字段应使用允许 `null` 的联合类型。跨供应商时，建议所有字段都必填，但不确定值返回 `null`。[JSON Schema 限制](https://developers.openai.com/api/docs/guides/structured-outputs)
- `gpt-5.4-nano` 的 alias 便于跟随更新；如果需要可复现评测，可固定 `gpt-5.4-nano-2026-03-17` snapshot。模型页同时给出了 Tier 1 为 500 RPM、200,000 TPM 的示例限额，生产配额不要假设所有账户相同。[模型页](https://developers.openai.com/api/docs/models/gpt-5.4-nano)

### 2. Google `gemini-3.5-flash-lite`

Google 将它描述为当前最具成本效率的 GA 模型，面向高吞吐 agent 任务、翻译和简单数据处理；模型页明确列出低延迟和 Structured Outputs 支持。[模型页](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite)

Gemini 的结构化输出通过 `response_format`、`mime_type: "application/json"` 和 `schema` 配置。官方说明它支持 JSON Schema 的子集，并列出 object、array、string、number、integer、boolean、null、required、enum、format 等能力；官方也要求应用层继续做语义校验。[Structured Output 指南](https://ai.google.dev/gemini-api/docs/structured-output)

概念调用形态如下，具体是 Interactions API 还是 Generate Content API，应跟随所选 SDK 版本对应的官方 API 参考：

```json
{
  "model": "gemini-3.5-flash-lite",
  "input": "Extract the time expression only.",
  "response_format": {
    "type": "text",
    "mime_type": "application/json",
    "schema": { "...": "timeExpressionSchema" }
  }
}
```

本插件建议：

- 解析、分类、抽取使用 Gemini 3.x 文档中的 `thinking_level: "minimal"` 方向，避免为短文本产生不必要的推理开销；Google 的最新模型指南把 minimal 定位为响应速度优先的简单任务设置。[最新模型指南](https://ai.google.dev/gemini-api/docs/latest-model)
- 不要把温度、`top_p`、`top_k` 等旧采样参数照搬到 Gemini 3.5 配置中；官方迁移指南已将这些参数列为需要移除或不再推荐的参数。[Gemini 3.5 迁移指南](https://ai.google.dev/gemini-api/docs/latest-model)
- `gemini-3.1-flash-lite` 价格更低（输入 $0.25、输出 $1.50），但官方弃用表已给出 2027-05-07 的 shutdown date，并推荐迁移到 `gemini-3.5-flash-lite`；因此不建议把 3.1 作为新插件的长期默认模型。[价格页](https://ai.google.dev/gemini-api/docs/pricing) [弃用表](https://ai.google.dev/gemini-api/docs/deprecations)

### 3. Anthropic `claude-haiku-4-5`

Anthropic 的模型总览将 Haiku 4.5 定位为“最快、接近前沿能力”，比较表给出 API alias `claude-haiku-4-5`、snapshot `claude-haiku-4-5-20251001`、输入 $1/MTok、输出 $5/MTok，并把它标为最快的模型。[Claude 模型总览](https://platform.claude.com/docs/en/about-claude/models/overview)

Claude API 的结构化输出使用：

```json
{
  "output_config": {
    "format": {
      "type": "json_schema",
      "schema": { "...": "timeExpressionSchema" }
    }
  }
}
```

响应会以文本 content block 返回合法 JSON；SDK 也提供 schema helper。Structured Outputs 页面说明该能力在 Haiku 4.5 上可用，并支持标准 JSON Schema 的一个受限子集。[Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)

主要限制：

- 每种新 schema 第一次使用时会有 grammar 编译延迟；编译结果会缓存 24 小时。插件应长期复用同一个小 schema，不要把用户文本拼进 schema。[Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- Structured Outputs 会注入额外系统提示并消耗少量输入 token；修改 `output_config.format` 会影响 prompt cache。[Claude Structured Outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- 即便有 schema，也要处理拒答和 token 不足等异常。模型输出满足 JSON 形状不等于日期和时区判断正确。
- Anthropic TypeScript SDK 默认禁用浏览器环境，以避免暴露秘密凭据；只有显式开启 `dangerouslyAllowBrowser` 才能在浏览器中调用，因此生产插件应走后端代理。[TypeScript SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript)

## 成本粗算

下表只是比较量级：假设每次请求约 300 个输入 token、100 个输出 token，调用 100,000 次；未计缓存、优先级/批处理、额外系统提示、失败重试以及模型内部思考 token。实际应以 API 返回的 usage 为准。

| 模型 | 单次粗算 | 100,000 次粗算 |
|---|---:|---:|
| `gpt-5.4-nano` | $0.000185 | **$18.50** |
| `gemini-3.5-flash-lite` | $0.000340 | **$34.00** |
| `claude-haiku-4-5` | $0.000800 | **$80.00** |
| `gpt-5.4-mini` | $0.000675 | **$67.50** |

Gemini 3.5 Flash-Lite 的输出价格包含 thinking tokens；如果开启更高推理级别，实际成本可能高于这个短输出估算。Anthropic 和 OpenAI 也会因 schema 注入、推理设置和重试产生额外 token。价格来源：[OpenAI nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano)、[OpenAI mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)、[Gemini 价格页](https://ai.google.dev/gemini-api/docs/pricing)、[Claude 模型总览](https://platform.claude.com/docs/en/about-claude/models/overview)。

## 针对插件的最终推荐

### 推荐架构

```text
选中文本
  ↓
本地规则解析
  ├─ 高置信度：本地完成
  └─ 低置信度/失败：调用后端 /parse-time
                         ↓
                 LLM 只输出结构化抽取结果
                         ↓
             IANA 时区库完成北京时间换算
                         ↓
                      Tooltip
```

建议默认策略：

1. 第一层本地规则处理 `3 pm UK`、`today`、`before/by/after` 等常见表达。
2. 规则失败或置信度低于产品阈值时调用 `gpt-5.4-nano`。
3. 模型返回 `ambiguous`、schema 校验失败或语义校验失败时，可重试一次；仍失败则在 Tooltip 中显示“无法确定”，不要猜一个北京时间。
4. 如果离线评测显示 nano 对复杂英语句子不够好，切换到 `gemini-3.5-flash-lite`；如果仍存在明显歧义，再把 `claude-haiku-4-5` 或 `gpt-5.4-mini` 作为二级升级，而不是所有请求都使用昂贵模型。

### 推荐的跨供应商 schema

为了兼容三家 API，第一版 schema 应保持扁平、短小，并让所有字段 required、未知值为 `null`：

```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": ["parsed", "ambiguous", "unsupported"]
    },
    "date_expression": { "type": ["string", "null"] },
    "time_expression": { "type": ["string", "null"] },
    "relation": {
      "type": "string",
      "enum": ["at", "before", "by", "after", "between", "unknown"]
    },
    "timezone_mention": { "type": ["string", "null"] },
    "source_timezone": { "type": ["string", "null"] },
    "confidence": { "type": "number" },
    "ambiguities": { "type": "array", "items": { "type": "string" } },
    "assumptions": { "type": "array", "items": { "type": "string" } }
  },
  "required": [
    "status", "date_expression", "time_expression", "relation",
    "timezone_mention", "source_timezone", "confidence",
    "ambiguities", "assumptions"
  ],
  "additionalProperties": false
}
```

`source_timezone` 必须在服务端用 IANA 时区白名单再次验证；像 `UK`、`London`、`BST`、`ET` 这类别名应由本地 alias 表转换，而不是直接信任模型生成的任意字符串。

### 浏览器插件实现注意事项

- **不要把厂商 API key 放进插件。** OpenAI 明确禁止把 key 部署在浏览器或移动端；Google 明确建议生产环境通过后端 proxy；Anthropic 的 SDK 也默认关闭浏览器支持。[OpenAI API key 安全](https://help.openai.com/en/articles/5112595-best-practices-for-api-key) [Gemini API key 安全](https://ai.google.dev/gemini-api/docs/api-key) [Anthropic TypeScript SDK](https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript)
- 插件只发送用户主动选中的字符串，加上必要的 `reference_datetime_utc`、用户目标时区和语言环境；默认不发送页面全文、URL、DOM 或相邻段落。
- 后端统一做供应商适配、schema 校验、IANA 时区校验、费用统计、限流、超时和重试；插件只消费一个稳定的 `/parse-time` 响应。
- 设置短输出上限，例如 256–512 token；不要让模型返回解释文章。Tooltip 需要的是结构化字段，不是自然语言答案。
- 把 `now` 明确传给模型和换算器，并说明日期基准。`today`、`tomorrow` 和 `next Thursday` 如果缺少源时区或上下文，应返回 `ambiguous`。
- 模型不负责计算北京时间，也不负责决定 BST/GMT 的固定偏移。统一由 `Europe/London`、`America/New_York` 等 IANA 标识和时区库处理。
- 在服务端对 `status`、`relation`、`confidence`、日期、时间、时区和边界关系做二次校验；Google 官方也特别提示，结构化输出即使是合法 JSON，应用仍需验证语义值。[Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output)
- 生产环境应记录 provider、model、schema version、latency、token usage、解析结果和错误类型，但不要默认记录用户原文；若为了评测保留原文，应提供脱敏和删除策略。
- 供应商数据政策不同：OpenAI API 默认不用于训练，但文档列出默认 30 天 abuse monitoring；Gemini 免费层标明内容可能用于改进产品，付费服务不用于改进产品但仍有安全监控日志；Anthropic 提供 ZDR 等不同数据处理安排。插件上线前应把这些差异写入隐私说明，并优先采用付费生产 API、最小化发送内容。[OpenAI 数据控制](https://developers.openai.com/api/docs/guides/your-data) [Gemini 价格与数据使用](https://ai.google.dev/gemini-api/docs/pricing) [Gemini ZDR](https://ai.google.dev/gemini-api/docs/zdr) [Anthropic 数据保留](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention)

## 上线前评测计划

不要只用一个 `today before 3 pm UK` 样例选模型。建议建立至少 100 条英文表达的固定评测集，覆盖：

- `today`、`tomorrow`、`next Monday`、带日期和不带年份。
- `before`、`by`、`after`、`at`、`between`。
- `UK/BST/GMT/London time`、`ET/EST/EDT/New York time`、CET、JST。
- `12 am`、`12 pm`、`midnight`、`noon`、`close of business`。
- 英国和北京时间跨日、夏令时切换、缺少时区、多个时间和明显歧义。

对每个模型记录：

1. 字段抽取准确率：日期、时间、关系、源时区分别计分。
2. 歧义识别率：不确定时是否返回 `ambiguous`，而不是猜测。
3. 端到端北京时间正确率：由统一时区库计算后比较最终结果。
4. p50/p95 端到端延迟：包含浏览器到后端、后端到模型和换算时间。
5. 每千次调用成本和失败重试次数。

最终决策规则建议是：先以“端到端正确率 + 歧义不误判”为硬门槛，再在通过门槛的模型中选择成本最低者。若没有实测结果，当前默认顺序为：

```text
gpt-5.4-nano
  → gemini-3.5-flash-lite
  → claude-haiku-4-5 或 gpt-5.4-mini
```

