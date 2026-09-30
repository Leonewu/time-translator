# Time Translator 竞品与替代品研究

调研日期：**2026-09-30**

## 结论摘要

Time Translator 面对的不是一个空白市场。现有产品至少覆盖四类工作流：选中文字后弹出换算、整页自动改写、工具栏多时区对照，以及日历内的时区显示；产品存在不等于用户需求已被验证。最接近的直接竞品是 **Timezone Tooltip**：其商店页描述了“选中即在页内显示”、相对日期、缺省源时区和多目标时区，而且宣称完全本地处理。**Auto Time Zone Converter** 与 **Localise Times** 则提供了“无选择、整页自动识别”的另一条路径；无法仅凭商店页推断用户接受程度。[Timezone Tooltip 商店页](https://chromewebstore.google.com/detail/timezone-tooltip-highligh/klcnieeicpmiemhnjanieifjdnkcmjgi) [Auto Time Zone Converter 商店页](https://chromewebstore.google.com/detail/auto-time-zone-converter/kfmhaonghmgncmpeggdeiigffbjecohi) [Localise Times 商店页](https://chromewebstore.google.com/detail/localise-times/lfapgjogceelfpildippecdikjnljkek)

因此，面向大众时不能只把“时区换算”当差异点。Time Translator 当前更有潜力的组合是：**复杂英文语义（`before`、`by`、`between`）+ Gmail 邮件日期作为相对日期上下文 + 确定性的 IANA 本地换算 + 用户可选模型**。但 BYOK、需要把选中文字发给模型、默认目标为上海及默认源为伦敦，都比竞品的“本地时区/纯本地/开箱即用”增加理解和信任成本。第一步应验证这个组合是否真的比纯规则工具解决更多高频失败案例，而不是先扩展功能面。

> 本文不推断或声称市场份额。商店显示的用户数、评分和更新时间会变化，也不能等同于活跃用户或市场份额。

## 研究口径与证据分层

- **A 级：一方产品说明**——Chrome Web Store 开发者提交的详情与隐私披露、产品官网、官方帮助/隐私/定价页。用于描述功能与声明。
- **B 级：本仓库实现与政策**——`README.md`、`manifest.json`、`privacy-policy.html`、`src/shared/config.js`。用于建立 Time Translator 比较基线。
- **C 级：分析判断**——基于 A/B 证据的机会、威胁和实验建议；不作为竞品已实现功能的事实。

限制：未安装、抓包或逆向竞品，也未用测试语料逐项实测；商店隐私披露属于开发者自报。若一方页面没有说明权限、收费或数据去向，本文明确写“未核实”，不从“未提及”推导“不存在”。

## Time Translator 当前基线

根据本仓库 `README.md`、`manifest.json`、`privacy-policy.html` 与 `src/shared/config.js`（B 级）：

- 选择英文时间表达后，可自动候选检测；也可通过右键菜单手动触发。正式承诺英文自然语言和带偏移的数字格式，包含相对日期、关系词与范围。
- Gmail 中会将所选文字所属邮件的时间作为 `today` 等表达的参考；不是发送整封邮件。
- 模型负责抽取语义；IANA 时区、夏令时和跨日换算在本地完成。默认源时区为 `Europe/London`，默认目标时区为 `Asia/Shanghai`。
- 用户自带所选模型服务商的 API Key；选中文字和必要的 Gmail 邮件时间会直达该服务商。Key、偏好和触发词保存在 `chrome.storage.local`，项目不设自建中转服务器。
- Manifest V3 声明 `storage`、`contextMenus` 与 `<all_urls>` host permission，并在所有网页注入 content script。当前版本与仓库文档均为 `0.1.25`。

## 直接竞品对比

| 产品 | 触发与展示 | 默认目标/源 | 覆盖与配置 | 收费 | 数据与权限：仅列一方明确内容 |
|---|---|---|---|---|---|
| **Timezone Tooltip** | 选中任意网页时间文本，立即在 tooltip 中显示；无需跳页 | 未写时源时区默认本地，也可按域名/精确 URL 指定；目标时区可多选、排序和改名 | 页面列举 `3pm PT`、`14:30 UTC`、`+0530`、无时区时间，以及 `today/tomorrow/yesterday`；未说明关系词或完整自然语言句 | 标题明确 “FREE”；未见付费层说明 | 商店页声称完全本地、无追踪/分析/外传，并披露“不收集或使用数据”；**精确 manifest 权限未核实**。[来源](https://chromewebstore.google.com/detail/timezone-tooltip-highligh/klcnieeicpmiemhnjanieifjdnkcmjgi) |
| **Auto Time Zone Converter** | 浏览网页时自动检测；覆盖 Web、Gmail、Online Outlook | 可换算到本地或自定义目标；最多 5 个目标时区并可改标签 | 声称识别相同缩写代表的不同地区、处理夏令时；可总开关。自然语言日期/关系词未说明 | 商店页提供安装，未说明付费层；**当前收费未核实** | 商店隐私披露其处理 “Website content”，并声明不出售、不作非核心用途、不用于信贷；页面没有说明是否网络传输，**精确权限未核实**。[来源](https://chromewebstore.google.com/detail/auto-time-zone-converter/kfmhaonghmgncmpeggdeiigffbjecohi) |
| **Localise Times** | 自动改写带时区缩写的数字时间；下划线标记，悬停看原文，点击恢复；另有输入文本的 sandbox | 换到用户本地时间；无缩写时可从菜单为当前页面选择源时区 | 示例包括 UTC/PDT/CEST、`UTC+1` 和时间范围；未声称相对日期或自由自然语言 | 商店页没有价格信息，**收费状态未核实** | 商店披露“不收集或使用数据”；没有进一步说明网络行为或精确权限。[来源](https://chromewebstore.google.com/detail/localise-times/lfapgjogceelfpildippecdikjnljkek) |
| **UTC → Local Time** | 自动扫描并就地改写，悬停保留原文；支持动态加载页面；可按网站禁用 | 浏览器本地时区；源限定 UTC/GMT 及带偏移格式 | ISO 8601、HTTP/RFC 日期、多种 12/24 小时格式；明确排除其他命名时区、代码块和可编辑区域；可选 12/24 小时制和标签 | 商店页没有价格信息，**收费状态未核实** | 商店页声称纯本地、无账户/跟踪/网络请求/收集，并称仅请求 `storage` 保存设置；这是开发者声明，未独立审计。[来源](https://chromewebstore.google.com/detail/utc-%E2%86%92-local-time/jdnpfcebpofehegihmombgcdaifpabkk) |
| **AutoConvert** | 选中文字后在页面角落自动显示；也可在 popup 输入；一次选区最多换 6 个值 | 时区换到检测到的本地时区；货币换到 home currencies | 同时处理单位、货币和时区；官方另链覆盖清单。自然语言日期能力未说明 | 页面仍写“货币换算试用后需购买”，更新记录又写 2024 年移除订阅、2023 年支持者功能免费；**当前时区功能收费边界无法从页面一致核实** | 商店页链接独立隐私政策，但商店详情截取未给出数据流/权限结论；本文不作断言。[商店页](https://chromewebstore.google.com/detail/autoconvert-you-select-it/einokpbfcmmopbfbpiofaeohhkmcbbcg) [隐私页（产品所链）](https://c306.net/apps/privacy/autoconvert-select/) |
| **Savvy Time Zone Converter** | 工具栏内并排比较；修改一地时间会同步其他地点；可打开可分享网页或创建日历事件 | 用户自行添加地点，没有“选中文本→本地时区”的默认路径 | 声称可搜索 24,000+ 城镇，支持城市/国家/缩写、未来日期、UTC offset、DST、12/24 小时和主题；换算离线运行 | 商店页没有列付费层；官网账户/其他产品收费不等于扩展收费，故**扩展收费未核实** | 商店披露“不收集或使用数据”；称时区数据内置，只有打开网站链接和在线日历服务需要联网，规则随扩展更新。[来源](https://chromewebstore.google.com/detail/savvy-time-zone-converter/plhnjpnbkmdmooideifhkonobdkgbbof) |

### 直接竞品观察

1. **“默认本地时区”是主流心智。** 上表五个自动/选中式工具中，明确目标默认值的产品都围绕用户本地时区，而不是固定某个城市。Time Translator 的上海默认值适合 Emma 原始使用场景，但对大众发布应至少首次启动时采用浏览器本地时区或显式询问。
2. **纯本地是强信任锚。** Timezone Tooltip、UTC → Local Time、Savvy 均主动强调本地/离线。Time Translator 的模型能覆盖更复杂语义，却必须让用户理解“为什么需要联网、发什么、发给谁”。
3. **竞争不只发生在解析准确率。** 自动整页改写减少操作，选中 tooltip 降低误触，工具栏对照适合规划。Time Translator 当前“本地候选检查后选中触发”是在自动性和可控性之间折中，但需用数据证明该折中更好。
4. **自然语言优势尚不能直接宣称领先。** 一方资料足以说明 Timezone Tooltip 支持三个相对日期，却不足以比较双方对自由句、歧义、关系词和 Gmail 邮件上下文的准确率；必须用同一语料实测。

## 替代品：用户可以不安装同类扩展

| 替代品 | 核心工作流 | 本地时区与覆盖 | 配置/收费 | 数据与权限边界 |
|---|---|---|---|---|
| **Google Calendar 内置时区** | 在日历网格显示额外时区；创建/编辑事件时选时区；支持起止分别设时区；另有 world clock | 新事件显示在用户本地时区，也会在受邀者各自本地时区显示；可设置 primary、secondary、tertiary 时区，按城市/国家搜索；使用 UTC 并说明 DST 规则变更的历史/远期限制 | Calendar 设置内置功能；该帮助页不构成套餐或价格证据，**所需 Google 套餐未核实** | 不是读取任意网页选区的扩展，因此无额外浏览器 host permission；账户数据处理应以 Google 条款为准，本文未审计。[官方帮助](https://support.google.com/calendar/answer/37064?hl=en) |
| **World Time Buddy** | 网页上添加地点，横向对照时段；鼠标悬停换算、点击 hour tile 后分享或导出到 Outlook/iCal、Google Calendar、Clipboard、Gmail | 多地点世界时钟/换算/会议规划；可设 home、排序和 12/24 小时 | 官网称登录保存设置为免费；未核实移动端或其他高级收费 | 作为网站处理用户主动配置，不具备读取其他网页的扩展权限；账户/分析的数据处理需另查其隐私页，本文不作无来源断言。[官网](https://www.worldtimebuddy.com/) |
| **Every Time Zone** | 可视化时间轴比较时区、选会议时间、分享链接或 iCal | 页面自动标出 “current local time / your local time”，同时列城市、缩写和 UTC offset；提供跨日期时间轴 | 页面导航明确区分 Timeline、Meetings、Pro、People Pro，但抓取到的官方首页没有稳定价格数字，**具体收费未核实** | 官网工作流不读取任意网页选区；登录与 Pro 功能的数据处理未在本次已获取页面中核实。[官网](https://everytimezone.com/) |

这些替代品的威胁不是“更懂自然语言”，而是用户已经在安排会议的最终落点完成换算：Google Calendar 可直接创建正确时区的事件，World Time Buddy/Every Time Zone 则一次比较多人时区。Time Translator 的优势必须发生在更早一步——用户刚读到邮件、工单或网页文本时——并减少复制、切页和手工建立事件之前的理解成本。

## 机会与威胁

### 机会

- **把复杂语义定义成可验证的产品边界。** 聚焦 `before/by/after/between`、省略年份/时区、相对日期和跨日结果；竞品一方资料大多只承诺格式与缩写，未承诺这些组合。
- **Gmail“邮件日期即 today 的上下文”是有辨识度的假设。** 已查直接竞品中，Auto Time Zone Converter 只声称可在 Gmail 使用，未说明会用邮件发送日期解释相对词；但这只是“未找到声明”，不能证明其绝对没有。
- **保留确定性换算并解释数据路径。** “模型只抽取、IANA 在本地换算、无自建中转”比笼统的 AI converter 更可解释。结果中可显示“理解为：邮件日期当天、伦敦、15:00 前”以便纠错。
- **大众默认值本地化。** 首次运行采用浏览器本地目标时区；上海/伦敦可作为迁移用户预设，而不是大众隐含假设。

### 威胁

- **零配置、本地处理竞品已经足够好。** 对 `3pm PT` 或 ISO/UTC 时间，LLM 与 BYOK 没有明显必要，反而增加延迟、故障点和隐私顾虑。
- **广泛网页权限带来安装阻力。** Time Translator 的 `<all_urls>` 与 content script 有功能理由，但对比 UTC → Local Time 所宣称的单一 `storage` 权限，会显得更重；商店文案需明确“为何需要”并考虑可选站点访问设计。
- **替代品占据“会议规划”场景。** 若扩展向多人时区表格、分享链接、日历调度扩张，会正面进入成熟网站和 Calendar 的优势区，稀释“读懂眼前一句话”的深模块。
- **BYOK 不等于大众体验。** 用户需理解服务商、模型、endpoint 和 API Key；配置失败会发生在首次价值之前。模型服务商还会获得所选文本及必要上下文，其政策不由 Time Translator 控制。
- **默认伦敦源时区可能生成“看似确定”的错误。** 大众网页中未写时区的时间未必是伦敦。静默默认应改为显式假设、按域名记忆，或在低置信度时询问。

## 建议的最小差异化验证

不要先做会议规划、全页替换或更多模型。做一个可在一至两轮迭代内回答“复杂语义是否值得联网”的验证：

1. **建立 60 条盲测语料**：20 条简单明确格式（ISO、UTC、`3pm PT`），20 条关系词/范围/跨日，20 条 Gmail 相对日期；每组包含缺省时区、DST 边界和应拒绝案例。记录人工金标准及允许的假设。
2. **同机对照三条路径**：Time Translator；最接近的选中式竞品 Timezone Tooltip；一个纯本地自动式竞品（Localise Times 或 UTC → Local Time）。只比较各自官方声称支持的范围，未支持应记为“范围外”，不伪装成错误率。
3. **只验证一个 UI 差异**：结果 tooltip 同时显示换算结果和一行“解释为：`邮件日期 9/30 · Europe/London · before 15:00`”，提供“一键改源时区/日期”。不要在实验阶段加入日历、多人时区或账户。
4. **成功标准**：复杂组端到端正确率显著高于规则竞品；用户完成一次复杂换算的中位时间更短；错误假设能被用户识别并修正；首次配置后成功完成首个换算的比例可接受。阈值应在测试前由团队确定，避免事后挑指标。
5. **否决条件**：若增益主要出现在低频构造句、简单格式明显更慢，或多数受试者拒绝提供 API Key/发送文本，则大众版应默认采用本地规则，只把模型作为明确选择的高级模式。

这一验证既能检验真正差异，也能暴露最大风险：模型语义收益是否足以抵消 BYOK、网络和权限成本。

## 来源索引与未核实项

### 一方来源

- Timezone Tooltip：[Chrome Web Store](https://chromewebstore.google.com/detail/timezone-tooltip-highligh/klcnieeicpmiemhnjanieifjdnkcmjgi)
- Auto Time Zone Converter：[Chrome Web Store](https://chromewebstore.google.com/detail/auto-time-zone-converter/kfmhaonghmgncmpeggdeiigffbjecohi)
- Localise Times：[Chrome Web Store](https://chromewebstore.google.com/detail/localise-times/lfapgjogceelfpildippecdikjnljkek)
- UTC → Local Time：[Chrome Web Store](https://chromewebstore.google.com/detail/utc-%E2%86%92-local-time/jdnpfcebpofehegihmombgcdaifpabkk)
- AutoConvert：[Chrome Web Store](https://chromewebstore.google.com/detail/autoconvert-you-select-it/einokpbfcmmopbfbpiofaeohhkmcbbcg)、[开发者所链隐私页](https://c306.net/apps/privacy/autoconvert-select/)
- Savvy Time Zone Converter：[Chrome Web Store](https://chromewebstore.google.com/detail/savvy-time-zone-converter/plhnjpnbkmdmooideifhkonobdkgbbof)
- Google Calendar：[官方时区帮助](https://support.google.com/calendar/answer/37064?hl=en)
- World Time Buddy：[官网](https://www.worldtimebuddy.com/)
- Every Time Zone：[官网](https://everytimezone.com/)

### 来源不支持、故不作结论

- 不以商店用户数、评分、Featured 标识推导活跃度、收入、留存或市场份额。
- 不以“商店没有价格”推导永久免费；除 Timezone Tooltip 标题明确 FREE、World Time Buddy 官网明确保存设置免费外，其余只报告页面能确认的收费信息。
- 不以“开发者披露不收集数据”推导代码已被独立审计，也不把“本地运行”扩大解释为绝无浏览器或操作系统遥测。
- 未从商店详情稳定核实多数扩展的完整 manifest 权限；只有 UTC → Local Time 的开发者文案明确声称仅 `storage`，仍未独立验证安装包。
- 未核实竞品对 `before/by/after/between`、Gmail 邮件日期上下文、多语言自然语言、歧义时区缩写和 DST 边界的实际准确率。
- 未核实 World Time Buddy、Every Time Zone、Google Calendar 在 2026-09-30 的完整套餐价格与账户数据处理；相关页面只用于验证本文所述交互和时区功能。
