# 求职邮件系统规划 (Job Auto-Apply)

## 项目概述

一个合规的、小批量的求职邮件管理系统，帮助有针对性地联系旧金山创业公司。

**核心原则：**
- 每日发送量控制在 20-30 封以内
- 每封邮件都需要个性化
- 使用公开可获取的联系方式
- 完全合规（CAN-SPAM, CCPA）

---

## 1. 旧金山创业公司信息来源（公开渠道）

### 主要来源

| 来源 | 类型 | 获取方式 | 备注 |
|------|------|----------|------|
| **Crunchbase** | 公司数据库 | 官方 API（免费层） | 融资信息、公司规模 |
| **AngelList/Wellfound** | 创业公司招聘 | 公开页面 | 直接申请渠道 |
| **Y Combinator** | 孵化器校友 | 公开目录 ycombinator.com/companies | 高质量创业公司 |
| **LinkedIn Jobs** | 招聘信息 | 公开职位页面 | 有招聘意向的公司 |
| **TechCrunch** | 新闻 | 报道中提及的公司 | 最新融资、扩张公司 |
| **Built In SF** | 科技招聘 | builtin.com/san-francisco | 本地科技公司 |

### 如何获取联系邮箱（合规方式）

1. **公司官网 Careers/Contact 页面** — 最合规
2. **LinkedIn 个人资料** — 查找招聘负责人
3. **公司博客/团队页面** — 公开展示的邮箱
4. **GitHub 组织页面** — 技术公司常有联系方式
5. **标准格式推测** — 如 `firstname@company.com`（需验证）

**不建议：**
- 购买邮件列表
- 使用数据抓取工具批量获取
- Hunter.io 等邮箱查找工具（灰色地带）

---

## 2. 邮件发送策略

### 发送节奏

```
周一至周五：
  - 上午 9:00-11:00 发送（PST 时区）
  - 每天 20-30 封，分批发送
  - 每封间隔 5-10 分钟（模拟人工）

每周总量：100-150 封
每月总量：400-600 封
```

### Gmail 安全使用建议

1. **使用 Google Workspace**（非个人 Gmail）
   - 每日限额 2000 封
   - 更专业的发件地址（yourname@yourdomain.com）
   - 月费约 $6

2. **或使用邮件发送服务**
   - SendGrid（每天 100 封免费）
   - Mailgun（每月 5000 封免费）
   - 有送达率优化和退订管理

3. **保护个人 Gmail**
   - 如果必须用个人 Gmail，每天不超过 50 封
   - 开启两步验证
   - 保持邮箱有正常的收发活动

---

## 3. 邮件模板设计

### 模板 A：通用冷邮件

```
主题：[你的技能] + 对 [公司名] 的兴趣

Hi [名字],

我是 [你的名字]，一名 [职位]，专注于 [技术领域]。

看到 [公司名] 正在 [具体事情 - 如"扩展 AI 产品线"/"最近的 A 轮融资"]，
我对你们的方向很感兴趣。

我在 [相关经验] 方面有经验，最近的项目是 [具体项目]。

附上我的简历/作品集：[链接]

方便的话，能否简短聊 15 分钟？

Best,
[你的名字]
[LinkedIn/个人网站]
```

### 模板 B：针对特定职位

```
主题：关于 [职位名称] - [你的独特价值]

Hi [招聘经理名字],

看到 [公司名] 在招聘 [职位]，我认为我的背景很匹配：

- [关键技能 1] — [简短证明]
- [关键技能 2] — [简短证明]
- [关键技能 3] — [简短证明]

我特别欣赏 [公司的某个特点/产品/文化]。

简历附上，期待有机会进一步交流。

Best,
[你的名字]
```

### 模板 C：跟进邮件（3-5天后）

```
主题：Re: [原邮件主题]

Hi [名字],

跟进一下我之前的邮件。

理解你可能很忙，如果目前没有合适的机会，能否指引我联系其他人？

谢谢！
[你的名字]
```

### 关键要素

- **主题行**：简短、具体、不像垃圾邮件
- **个性化**：至少提及公司名和一个具体细节
- **CTA**：明确的行动号召（15分钟通话、查看作品集）
- **签名**：包含退订方式（合规要求）

---

## 4. 跟进策略

```
Day 0:  发送初始邮件
Day 4:  如无回复，发送跟进 1（模板 C）
Day 10: 如无回复，发送跟进 2（提供新信息/价值）
Day 20: 如无回复，发送最终跟进（告知不再打扰）

最多 4 封邮件，之后移入"冷"名单
```

### 回复处理

| 回复类型 | 处理方式 |
|----------|----------|
| 积极回复 | 24小时内回复，安排通话 |
| "现在没有职位" | 感谢，询问是否可以未来联系 |
| "请联系 XX" | 感谢转介，联系新目标 |
| 无回复 | 按跟进策略处理 |
| 要求停止联系 | 立即停止，加入黑名单 |

---

## 5. 技术栈规划

### 推荐架构

```
┌─────────────────────────────────────────────────────┐
│                   前端 (可选)                        │
│              React/Vue 仪表板                        │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│                   后端 API                           │
│                   Node.js                            │
├─────────────────────────────────────────────────────┤
│  - 联系人管理                                        │
│  - 邮件调度                                          │
│  - 模板引擎                                          │
│  - 跟进追踪                                          │
└─────────────────────┬───────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│                   数据存储                           │
│              SQLite / PostgreSQL                     │
├─────────────────────────────────────────────────────┤
│  - 公司信息                                          │
│  - 联系人                                            │
│  - 邮件历史                                          │
│  - 状态追踪                                          │
└─────────────────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────────────┐
│                 邮件发送服务                          │
│         Gmail API / SendGrid / Nodemailer            │
└─────────────────────────────────────────────────────┘
```

### 技术选型

| 组件 | 技术 | 理由 |
|------|------|------|
| 运行时 | Node.js | 简单，异步处理好 |
| 数据库 | SQLite | 轻量，无需额外服务 |
| 邮件 | Nodemailer + Gmail API | 易于设置 |
| 调度 | node-cron | 定时发送 |
| CLI | Commander.js | 命令行操作 |

### 项目结构

```
job-auto-apply/
├── src/
│   ├── index.js           # 入口
│   ├── db/
│   │   ├── schema.sql     # 数据库结构
│   │   └── database.js    # 数据库操作
│   ├── email/
│   │   ├── sender.js      # 发送逻辑
│   │   ├── templates.js   # 邮件模板
│   │   └── scheduler.js   # 定时调度
│   ├── contacts/
│   │   ├── manager.js     # 联系人管理
│   │   └── import.js      # 导入工具
│   └── utils/
│       └── logger.js      # 日志
├── data/
│   ├── companies.csv      # 公司列表
│   ├── contacts.csv       # 联系人
│   └── templates/         # 邮件模板
├── config/
│   └── config.json        # 配置
├── package.json
└── README.md
```

---

## 6. 数据模型

### companies 表
```sql
CREATE TABLE companies (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  website TEXT,
  industry TEXT,           -- AI, SaaS, Fintech, etc.
  size TEXT,               -- 1-10, 11-50, 51-200, etc.
  location TEXT,
  funding_stage TEXT,      -- Seed, Series A, etc.
  source TEXT,             -- 信息来源
  notes TEXT,
  priority INTEGER,        -- 1-5, 5最高
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### contacts 表
```sql
CREATE TABLE contacts (
  id INTEGER PRIMARY KEY,
  company_id INTEGER,
  name TEXT,
  email TEXT NOT NULL,
  title TEXT,
  linkedin TEXT,
  source TEXT,             -- 邮箱来源（官网、LinkedIn等）
  status TEXT DEFAULT 'new', -- new, contacted, replied, not_interested
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id)
);
```

### emails 表
```sql
CREATE TABLE emails (
  id INTEGER PRIMARY KEY,
  contact_id INTEGER,
  template_id TEXT,
  subject TEXT,
  body TEXT,
  status TEXT,             -- draft, scheduled, sent, failed
  sent_at DATETIME,
  opened_at DATETIME,
  replied_at DATETIME,
  followup_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contact_id) REFERENCES contacts(id)
);
```

---

## 7. 合规清单

### CAN-SPAM 合规

- [ ] 邮件包含真实发件人信息
- [ ] 主题行准确反映内容
- [ ] 包含物理地址（可用 PO Box）
- [ ] 提供退订方式
- [ ] 10 个工作日内处理退订请求
- [ ] 不使用欺骗性标题或内容

### 最佳实践

- [ ] 每封邮件都有个性化内容
- [ ] 保持发送频率稳定
- [ ] 立即处理退信和投诉
- [ ] 维护黑名单
- [ ] 记录所有发送活动

---

## 8. 下一步行动

1. **初始化项目** — 设置 Node.js 项目结构
2. **创建数据库** — 设置 SQLite 和表结构
3. **手动收集数据** — 从公开渠道收集 50 家目标公司
4. **设置邮件** — 配置 Gmail API 或 SendGrid
5. **实现核心功能** — 联系人管理 + 邮件发送
6. **测试** — 先发给自己测试

---

## 注意事项

**本系统设计用于个人求职，不是营销工具。**

如果你发现自己：
- 想要大幅提高发送量
- 想要自动抓取邮箱
- 收到大量投诉

请停下来重新评估策略。质量 > 数量。
