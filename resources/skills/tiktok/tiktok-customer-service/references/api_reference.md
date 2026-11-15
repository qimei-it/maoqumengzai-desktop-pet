# TikTok Customer Service - API Reference

## 数据接口规范

### 1. 智能回复生成

#### POST /api/customer/reply
生成客户回复

**Request Body:**
```json
{
  "message": "我的快递怎么还没到？",
  "context": {
    "orderId": "ORDER123",
    "customerInfo": {
      "tier": "normal",
      "orderCount": 3
    },
    "productInfo": {
      "name": "面膜",
      "shippingStatus": "in_transit",
      "estimatedArrival": "2024-01-15"
    }
  },
  "options": {
    "tone": "friendly",
    "includeEmoji": true
  }
}
```

**Response:**
```json
{
  "reply": "亲亲您好~ 小白帮您查了一下，您的宝贝已经到达【杭州转运中心】啦~ 预计明天就能送到您手上哦~ 📦✨",
  "sentiment": "anxious",
  "category": "logistics",
  "suggestedActions": [
    "查询物流详情",
    "联系快递"
  ]
}
```

### 2. 评价回复生成

#### POST /api/customer/review-reply
生成评价回复

**Request Body:**
```json
{
  "review": {
    "rating": 1,
    "content": "色差太大，图片是骗人的！",
    "hasImages": false
  },
  "product": {
    "name": "口红",
    "colorOptions": ["正红色", "豆沙色"]
  }
}
```

**Response:**
```json
{
  "replies": [
    {
      "type": "apology",
      "content": "非常抱歉给您带来不好的体验 😔...",
      "priority": "high"
    },
    {
      "type": "solution",
      "content": "如果您实在不满意，我们支持7天无理由退换...",
      "priority": "high"
    }
  ],
  "escalation": true,
  "compensation": {
    "type": "coupon",
    "amount": 10
  }
}
```

### 3. FAQ 管理

#### GET /api/customer/faq
获取 FAQ 列表

**Query Parameters:**
- `category`: 分类
- `keyword`: 搜索关键词
- `hot`: 热门问题

**Response:**
```json
{
  "faqs": [
    {
      "id": 1,
      "question": "什么时候发货？",
      "answer": "16:00前下单当天发，之后次日发",
      "category": "logistics",
      "hitCount": 1520,
      "effectiveness": 0.92
    }
  ]
}
```

### 4. 客户情绪分析

#### POST /api/customer/sentiment
分析客户消息情绪

**Request Body:**
```json
{
  "messages": [
    "怎么还没发货？",
    "你们太慢了！",
    "我要退款！"
  ]
}
```

**Response:**
```json
{
  "overallSentiment": "angry",
  "confidence": 0.89,
  "emotions": [
    {"type": "frustrated", "score": 0.75},
    {"type": "disappointed", "score": 0.60}
  ],
  "suggestedStrategy": "escalate"
}
```

---

## 数据模型

### CustomerMessage
```typescript
interface CustomerMessage {
  content: string;
  timestamp: Date;
  sentiment?: 'positive' | 'neutral' | 'negative';
  category?: string;
}
```

### ReplySuggestion
```typescript
interface ReplySuggestion {
  content: string;
  tone: 'friendly' | 'professional' | 'apologetic';
  includeEmoji: boolean;
  suggestedActions?: string[];
}
```

### Review
```typescript
interface Review {
  rating: number;
  content: string;
  hasImages: boolean;
  timestamp: Date;
}
```

---

## 错误代码

| 代码 | 说明 | 处理建议 |
|------|------|---------|
| 2001 | 无法识别客户意图 | 转人工客服 |
| 2002 | 情绪分析失败 | 使用默认友好回复 |
| 2003 | FAQ 匹配失败 | 提供人工联系方式 |

---

**Version**: 1.0
**Last Updated**: 2024
