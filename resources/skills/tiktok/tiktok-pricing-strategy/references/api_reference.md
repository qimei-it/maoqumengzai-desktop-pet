# TikTok Pricing Strategy - API Reference

## 数据接口规范

### 1. 价格分析接口

#### POST /api/pricing/analyze
分析产品定价策略

**Request Body:**
```json
{
  "product": {
    "name": "示例产品",
    "cost": 80,
    "category": "美妆护肤"
  },
  "competitors": [
    {"name": "竞品A", "price": 158},
    {"name": "竞品B", "price": 199}
  ],
  "target": {
    "profitMargin": 0.4,
    "salesVolume": 1000
  }
}
```

**Response:**
```json
{
  "recommendations": {
    "optimalPrice": 179,
    "priceRange": [169, 199],
    "psychologicalPrice": 199
  },
  "analysis": {
    "costPlusPrice": 200,
    "competitorAvgPrice": 178.5,
    "profitMargin": 0.42
  },
  "scenarios": [
    {
      "price": 179,
      "expectedSales": 1200,
      "profit": 118800,
      "profitMargin": 0.55
    }
  ]
}
```

### 2. 达人报价计算接口

#### POST /api/pricing/influencer-quote
计算达人合理报价

**Request Body:**
```json
{
  "influencer": {
    "followers": 500000,
    "engagementRate": 0.08,
    "niche": "美妆"
  },
  "campaign": {
    "type": "video",
    "duration": 60,
    "deliverables": ["原创视频", "评论区互动"]
  }
}
```

**Response:**
```json
{
  "quote": {
    "recommended": 22000,
    "range": [20000, 25000],
    "cpm": 550
  },
  "breakdown": {
    "baseRate": 20000,
    "engagementBonus": 2000,
    "complexityAdjustment": 0
  },
  "comparables": [
    {
      "followers": "50万",
      "avgQuote": "15000-25000"
    }
  ]
}
```

### 3. 促销方案生成接口

#### POST /api/pricing/promotion
生成促销活动方案

**Request Body:**
```json
{
  "product": {
    "originalPrice": 199,
    "cost": 80,
    "inventory": 3000
  },
  "promotion": {
    "type": "双11",
    "targetSales": 2000,
    "minProfitMargin": 0.2
  }
}
```

**Response:**
```json
{
  "schemes": [
    {
      "name": "折扣方案",
      "discount": 0.8,
      "salePrice": 159,
      "profitMargin": 0.35,
      "expectedSales": 2500,
      "totalProfit": 197500
    },
    {
      "name": "买赠方案",
      "type": "buy2get1",
      "effectiveDiscount": 0.67,
      "profitMargin": 0.25,
      "expectedSales": 3000,
      "totalProfit": 149700
    }
  ]
}
```

### 4. 竞品价格监控接口

#### GET /api/pricing/competitors
获取竞品价格数据

**Query Parameters:**
- `category`: 产品品类
- `keyword`: 搜索关键词
- `priceRange`: 价格区间

**Response:**
```json
{
  "competitors": [
    {
      "productName": "竞品口红",
      "price": 168,
      "sales": 50000,
      "rating": 4.8,
      "shop": "官方旗舰店"
    }
  ],
  "analysis": {
    "minPrice": 99,
    "maxPrice": 299,
    "avgPrice": 178,
    "modePrice": 168
  }
}
```

---

## 数据模型

### PriceAnalysis
```typescript
interface PriceAnalysis {
  optimalPrice: number;
  priceRange: [number, number];
  psychologicalPrice: number;
  costPlusPrice: number;
  competitorAvgPrice: number;
  expectedSales: number;
  profitMargin: number;
}
```

### InfluencerQuote
```typescript
interface InfluencerQuote {
  recommended: number;
  range: [number, number];
  cpm: number;
  breakdown: {
    baseRate: number;
    engagementBonus: number;
    complexityAdjustment: number;
  };
}
```

### PromotionScheme
```typescript
interface PromotionScheme {
  name: string;
  discount?: number;
  salePrice: number;
  profitMargin: number;
  expectedSales: number;
  totalProfit: number;
}
```

---

## 错误代码

| 代码 | 说明 | 处理建议 |
|------|------|---------|
| 1001 | 成本价格不能为空 | 检查输入参数 |
| 1002 | 竞品数据不足 | 扩大搜索范围 |
| 1003 | 无法计算利润率 | 检查定价参数 |
| 1004 | 达人数据异常 | 验证粉丝数据真实性 |

---

**Version**: 1.0
**Last Updated**: 2024
