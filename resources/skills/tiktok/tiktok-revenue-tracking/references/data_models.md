# TikTok Revenue Tracking - Data Models

## 达人收入模型

### RevenueRecord
```python
{
  "date": "2024-01-15",           # 收入日期
  "source": "商单",                # 收入来源: 商单/带货佣金/广告收入/直播打赏/其他
  "amount": 15000.00,             # 金额（元）
  "platform": "TikTok",           # 平台
  "description": "美妆品牌合作",   # 描述
  "commission_rate": null,        # 佣金率（带货时）
  "product_id": null,             # 产品ID（带货时）
  "brand_id": "BRAND001",         # 品牌ID（商单时）
  "contract_id": "CONTRACT123"    # 合同ID
}
```

### IncomeSummary
```python
{
  "period": {
    "start": "2024-01-01",
    "end": "2024-01-31"
  },
  "by_source": {
    "商单": {
      "amount": 25000,
      "count": 3,
      "percentage": 45
    },
    "带货佣金": {
      "amount": 18500,
      "count": 15,
      "percentage": 33
    }
  },
  "total": 56200,
  "daily_average": 1812.90
}
```

---

## 商家销售模型

### SalesRecord
```python
{
  "date": "2024-01-15",           # 销售日期
  "channel": "达人",               # 渠道: 自营/达人/直播/广告
  "gmv": 50000.00,                # GMV
  "cost": 15000.00,               # 商品成本
  "commission": 10000.00,         # 达人佣金
  "ad_spend": 5000.00,            # 广告费用
  "influencer_id": "INF001",      # 达人ID
  "product_id": "PROD001",        # 产品ID
  "order_count": 200              # 订单数
}
```

### ChannelSummary
```python
{
  "period": {
    "start": "2024-01-01",
    "end": "2024-01-31"
  },
  "by_channel": {
    "自营": {
      "gmv": 120000,
      "cost": 40000,
      "commission": 0,
      "ad_spend": 10000,
      "profit": 70000,
      "count": 500,
      "gmv_percentage": 35
    },
    "达人": {
      "gmv": 150000,
      "cost": 50000,
      "commission": 30000,
      "ad_spend": 0,
      "profit": 70000,
      "count": 3,
      "gmv_percentage": 44
    }
  },
  "total_gmv": 340000,
  "total_profit": 170000
}
```

---

## ROI 分析模型

### ROIMetrics
```python
{
  "revenue": 45000.00,            # 收入
  "cost": 23000.00,               # 成本
  "profit": 22000.00,             # 利润
  "roi": 0.96,                   # ROI 系数
  "roi_percentage": 95.65         # ROI 百分比
}
```

### ROIComparison
```python
{
  "current_roi": 1.85,
  "benchmark": 2.0,
  "difference": -0.15,
  "difference_percentage": -7.5,
  "performance": "一般"            # 优秀/良好/一般/需优化
}
```

---

## 预测模型

### TrendForecast
```python
{
  "forecast_period": "2024-02-01 to 2024-04-30",
  "method": "moving_average",     # moving_average/linear_regression
  "predictions": [
    {
      "period": "2024-02",
      "predicted": 62000,
      "lower_bound": 58000,
      "upper_bound": 66000,
      "confidence": 0.85
    },
    {
      "period": "2024-03",
      "predicted": 65000,
      "lower_bound": 60000,
      "upper_bound": 70000,
      "confidence": 0.75
    }
  ],
  "trend": "上升"                  # 上升/平稳/下降
}
```

---

## 数据格式规范

### 日期格式
- 使用 ISO 8601 格式: `YYYY-MM-DD`
- 时区: UTC+8 (中国标准时间)

### 金额格式
- 单位: 人民币（元）
- 精度: 保留 2 位小数
- 存储类型: Float 或 Decimal

### 百分比格式
- 存储类型: Float
- 范围: 0.0 - 1.0（计算时）或 0 - 100（显示时）

### 枚举值规范

**收入来源**
- `sponsorship`: 商单收入
- `commission`: 带货佣金
- `ad`: 广告收入
- `live`: 直播打赏
- `other`: 其他

**渠道类型**
- `self_operated`: 自营店铺
- `influencer`: 达人带货
- `live`: 直播
- `ad`: 广告投放

**表现评级**
- `excellent`: 优秀（ROI ≥ 基准 × 1.2）
- `good`: 良好（基准 ≤ ROI < 基准 × 1.2）
- `average`: 一般（基准 × 0.8 ≤ ROI < 基准）
- `poor`: 需优化（ROI < 基准 × 0.8）

---

## API 数据结构

### 添加收入记录
**POST** `/api/revenue/add`

Request:
```json
{
  "records": [
    {
      "date": "2024-01-15",
      "source": "sponsorship",
      "amount": 15000,
      "description": "美妆品牌合作"
    }
  ]
}
```

Response:
```json
{
  "success": true,
  "added": 1,
  "records": [
    {
      "id": "REV001",
      "status": "created"
    }
  ]
}
```

### 获取收入汇总
**GET** `/api/revenue/summary`

Query Parameters:
- `start_date`: 开始日期
- `end_date`: 结束日期
- `group_by`: 分组方式

Response:
```json
{
  "summary": {
    "by_source": {...},
    "total": 56200
  },
  "growth": {
    "mom": 15.5,
    "yoy": 120.0
  }
}
```

### 计算 ROI
**POST** `/api/roi/calculate`

Request:
```json
{
  "channel": "ad",
  "revenue": 45000,
  "cost_breakdown": {
    "ad_spend": 10000,
    "product_cost": 18000
  }
}
```

Response:
```json
{
  "roi": {
    "value": 0.96,
    "percentage": 95.65
  },
  "comparison": {
    "benchmark": 2.0,
    "performance": "一般"
  },
  "suggestions": [
    "点击率偏低，建议优化广告创意"
  ]
}
```

---

**Last Updated**: 2024
