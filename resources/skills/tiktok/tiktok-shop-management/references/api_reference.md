# TikTok 店铺管理 API 参考

## 订单管理 API

### 获取订单列表

**Endpoint**: `GET /api/v2/orders`

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 页码，默认 1 |
| page_size | int | 否 | 每页数量，默认 20 |
| create_time_from | int | 否 | 创建时间起始（时间戳） |
| create_time_to | int | 否 | 创建时间结束（时间戳） |
| order_status | string | 否 | 订单状态筛选 |

**响应示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "orders": [
      {
        "order_id": "7234567890123456789",
        "order_status": "AWAITING_SHIPMENT",
        "create_time": 1698765432,
        "buyer_info": {...},
        "items": [...],
        "total_amount": 99.99
      }
    ],
    "total": 150,
    "page": 1,
    "page_size": 20
  }
}
```

### 获取订单详情

**Endpoint**: `GET /api/v2/orders/{order_id}`

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| order_id | string | 订单 ID |

**响应示例**:
```json
{
  "code": 0,
  "data": {
    "order_id": "7234567890123456789",
    "order_status": "AWAITING_SHIPMENT",
    "payment_method": "CREDIT_CARD",
    "shipping_info": {
      "name": "John Doe",
      "address": "123 Main St, City, State 12345",
      "phone": "+1234567890"
    },
    "items": [
      {
        "product_id": "prod_123",
        "sku_id": "sku_456",
        "name": "Product Name",
        "quantity": 2,
        "price": 49.99
      }
    ]
  }
}
```

### 订单发货

**Endpoint**: `POST /api/v2/orders/{order_id}/ship`

**请求体**:
```json
{
  "tracking_number": "1Z999AA10123456784",
  "carrier": "USPS",
  "ship_time": 1698765432
}
```

---

## 商品管理 API

### 获取商品列表

**Endpoint**: `GET /api/v2/products`

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 页码 |
| page_size | int | 否 | 每页数量 |
| status | string | 否 | 商品状态 |
| category_id | int | 否 | 类目 ID |

### 创建商品

**Endpoint**: `POST /api/v2/products`

**请求体**:
```json
{
  "title": "Product Title",
  "description": "Product Description",
  "category_id": 100001,
  "brand_id": 12345,
  "images": ["url1", "url2", "url3"],
  "video": {"video_id": "v123"},
  "skus": [
    {
      "name": "Red-S",
      "price": 29.99,
      "stock": 100,
      "attributes": [
        {"name": "Color", "value": "Red"},
        {"name": "Size", "value": "S"}
      ]
    }
  ]
}
```

### 更新商品

**Endpoint**: `PUT /api/v2/products/{product_id}`

### 删除商品

**Endpoint**: `DELETE /api/v2/products/{product_id}`

---

## 客服管理 API

### 获取会话列表

**Endpoint**: `GET /api/v2/conversations`

### 发送消息

**Endpoint**: `POST /api/v2/conversations/{conversation_id}/messages`

**请求体**:
```json
{
  "type": "TEXT",
  "content": "Hello! How can I help you?",
  "attachments": []
}
```

### 获取回复模板

**Endpoint**: `GET /api/v2/message_templates`

**响应示例**:
```json
{
  "templates": [
    {
      "id": "tpl_001",
      "name": "物流查询回复",
      "content": "您好！您的订单已发货，物流单号：{{tracking_number}}",
      "category": "LOGISTICS"
    }
  ]
}
```

---

## 数据中心 API

### 获取销售数据

**Endpoint**: `GET /api/v2/data/sales`

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| start_date | string | 是 | 开始日期 (YYYY-MM-DD) |
| end_date | string | 是 | 结束日期 (YYYY-MM-DD) |
| granularity | string | 否 | 时间粒度：DAY/WEEK/MONTH |

**响应示例**:
```json
{
  "data": {
    "metrics": {
      "gmv": 12345.67,
      "order_count": 234,
      "buyer_count": 198,
      "refund_rate": 0.023
    },
    "trend": [
      {
        "date": "2024-01-01",
        "gmv": 1234.56,
        "order_count": 23
      }
    ]
  }
}
```

### 获取商品数据

**Endpoint**: `GET /api/v2/data/products`

### 获取流量数据

**Endpoint**: `GET /api/v2/data/traffic`

---

## 营销中心 API

### 创建优惠券

**Endpoint**: `POST /api/v2/promotions/vouchers`

**请求体**:
```json
{
  "name": "New Customer Discount",
  "type": "FIXED_AMOUNT",
  "value": 10.00,
  "min_purchase": 50.00,
  "total_quantity": 1000,
  "start_time": 1698765432,
  "end_time": 1701357432
}
```

### 获取活动列表

**Endpoint**: `GET /api/v2/promotions/campaigns`

---

## 错误码参考

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 1001 | 参数错误 |
| 1002 | 权限不足 |
| 2001 | 资源不存在 |
| 3001 | 频率限制 |
| 4001 | 系统错误 |

---

**Version**: 1.0  
**Last Updated**: 2024
