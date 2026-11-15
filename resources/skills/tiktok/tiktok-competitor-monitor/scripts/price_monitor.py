#!/usr/bin/env python3
"""
TikTok Price Monitor
价格监控脚本
"""

from typing import List, Dict, Optional
from dataclasses import dataclass
from datetime import date
from enum import Enum


class PriceChangeType(Enum):
    """价格变动类型"""
    INCREASE = "涨价"
    DECREASE = "降价"
    UNCHANGED = "无变化"
    PROMO_START = "促销开始"
    PROMO_END = "促销结束"


@dataclass
class ProductInfo:
    """产品信息"""
    product_id: str
    name: str
    category: str
    brand: str


@dataclass
class PriceRecord:
    """价格记录"""
    date: date
    product_id: str
    seller: str          # 卖家/店铺
    original_price: float  # 原价
    current_price: float   # 现价
    is_promo: bool        # 是否促销
    stock_status: str     # 库存状态


@dataclass
class PriceAlert:
    """价格预警"""
    product_id: str
    product_name: str
    change_type: PriceChangeType
    old_price: float
    new_price: float
    change_percentage: float
    seller: str


class PriceMonitor:
    """价格监控器"""

    # 价格变动预警阈值
    ALERT_THRESHOLDS = {
        "decrease_minor": 0.05,    # 降价 5% 以上
        "decrease_major": 0.15,    # 降价 15% 以上
        "increase_minor": 0.05,    # 涨价 5% 以上
        "increase_major": 0.10     # 涨价 10% 以上
    }

    def __init__(self):
        self.price_history: List[PriceRecord] = []
        self.products: Dict[str, ProductInfo] = {}
        self.alerts: List[PriceAlert] = []

    def add_product(self, product: ProductInfo):
        """添加产品"""
        self.products[product.product_id] = product

    def add_price_record(self, record: PriceRecord):
        """添加价格记录"""
        self.price_history.append(record)

    def get_current_prices(
        self,
        product_id: str
    ) -> List[Dict]:
        """获取当前竞品价格"""
        records = [
            r for r in self.price_history
            if r.product_id == product_id
        ]

        if not records:
            return []

        # 按卖家分组，取最新价格
        seller_prices = {}
        for record in records:
            if record.seller not in seller_prices:
                seller_prices[record.seller] = record
            elif record.date > seller_prices[record.seller].date:
                seller_prices[record.seller] = record

        return [
            {
                "seller": seller,
                "price": record.current_price,
                "original_price": record.original_price,
                "is_promo": record.is_promo,
                "discount": (
                    (record.original_price - record.current_price) / record.original_price * 100
                    if record.original_price > 0 else 0
                ),
                "stock": record.stock_status,
                "date": record.date
            }
            for seller, record in seller_prices.items()
        ]

    def compare_prices(
        self,
        product_id: str,
        my_price: Optional[float] = None
    ) -> Dict:
        """价格对比分析"""
        prices = self.get_current_prices(product_id)

        if not prices:
            return {"error": "No price data found"}

        product = self.products.get(product_id)

        # 计算价格统计
        current_prices = [p["price"] for p in prices]
        min_price = min(current_prices)
        max_price = max(current_prices)
        avg_price = sum(current_prices) / len(current_prices)

        # 价格分布
        price_ranges = {
            "低价位": sum(1 for p in current_prices if p < avg_price * 0.8),
            "中价位": sum(1 for p in current_prices if avg_price * 0.8 <= p <= avg_price * 1.2),
            "高价位": sum(1 for p in current_prices if p > avg_price * 1.2)
        }

        result = {
            "product": product.name if product else product_id,
            "min_price": min_price,
            "max_price": max_price,
            "avg_price": avg_price,
            "price_range": max_price - min_price,
            "competitor_count": len(prices),
            "price_distribution": price_ranges,
            "prices": sorted(prices, key=lambda x: x["price"])
        }

        # 如果提供了自己的价格，进行对比
        if my_price is not None:
            result["my_price"] = my_price
            result["my_position"] = self._get_price_position(my_price, current_prices)
            result["recommendation"] = self._get_pricing_recommendation(
                my_price, current_prices, product.category if product else ""
            )

        return result

    def detect_price_changes(
        self,
        days: int = 7
    ) -> List[PriceAlert]:
        """检测价格变动"""
        cutoff_date = date.today() - timedelta(days=days)

        # 按产品和卖家分组
        price_map = {}
        for record in self.price_history:
            key = (record.product_id, record.seller)
            if key not in price_map:
                price_map[key] = []
            price_map[key].append(record)

        alerts = []

        for (product_id, seller), records in price_map.items():
            # 排序并获取前后价格
            sorted_records = sorted(records, key=lambda r: r.date)

            # 找到最近的价格和之前的价格
            latest = None
            previous = None

            for i in range(len(sorted_records) - 1, -1, -1):
                if sorted_records[i].date >= cutoff_date:
                    if latest is None:
                        latest = sorted_records[i]
                    previous = sorted_records[i - 1] if i > 0 else None
                    if previous and previous.date < cutoff_date:
                        break

            if latest and previous:
                change = latest.current_price - previous.current_price
                change_pct = change / previous.current_price if previous.current_price > 0 else 0

                # 判断变动类型
                if latest.is_promo and not previous.is_promo:
                    change_type = PriceChangeType.PROMO_START
                elif not latest.is_promo and previous.is_promo:
                    change_type = PriceChangeType.PROMO_END
                elif change < 0:
                    change_type = PriceChangeType.DECREASE
                elif change > 0:
                    change_type = PriceChangeType.INCREASE
                else:
                    change_type = PriceChangeType.UNCHANGED

                # 判断是否需要预警
                if change_type != PriceChangeType.UNCHANGED:
                    product = self.products.get(product_id)
                    alert = PriceAlert(
                        product_id=product_id,
                        product_name=product.name if product else product_id,
                        change_type=change_type,
                        old_price=previous.current_price,
                        new_price=latest.current_price,
                        change_percentage=change_pct * 100,
                        seller=seller
                    )
                    alerts.append(alert)

        self.alerts.extend(alerts)
        return alerts

    def _get_price_position(self, price: float, competitor_prices: List[float]) -> str:
        """判断价格定位"""
        sorted_prices = sorted(competitor_prices)

        if price <= sorted_prices[0]:
            return "最低价"
        elif price <= sorted_prices[len(sorted_prices) // 3]:
            return "低价位"
        elif price <= sorted_prices[len(sorted_prices) * 2 // 3]:
            return "中价位"
        elif price < sorted_prices[-1]:
            return "高价位"
        else:
            return "最高价"

    def _get_pricing_recommendation(
        self,
        my_price: float,
        competitor_prices: List[float],
        category: str
    ) -> str:
        """获取定价建议"""
        avg_price = sum(competitor_prices) / len(competitor_prices)
        min_price = min(competitor_prices)

        if my_price > avg_price * 1.2:
            return f"价格偏高，建议降至 ¥{avg_price:.0f} 附近"
        elif my_price < min_price * 0.9:
            return f"价格过低，可能影响利润，建议适当提价"
        elif my_price <= avg_price * 1.1:
            return "价格合理，保持当前定价"
        else:
            return "价格适中，可根据促销需求灵活调整"


def main():
    """示例使用"""
    monitor = PriceMonitor()

    # 添加产品
    product = ProductInfo(
        product_id="PROD001",
        name="润唇膏",
        category="美妆护肤",
        brand="示例品牌"
    )
    monitor.add_product(product)

    # 添加价格记录
    from datetime import timedelta
    today = date.today()

    # 竞品A的价格
    monitor.add_price_record(PriceRecord(
        date=today - timedelta(days=10),
        product_id="PROD001",
        seller="竞品A",
        original_price=99,
        current_price=99,
        is_promo=False,
        stock_status="有货"
    ))

    monitor.add_price_record(PriceRecord(
        date=today,
        product_id="PROD001",
        seller="竞品A",
        original_price=99,
        current_price=79,
        is_promo=True,
        stock_status="有货"
    ))

    # 竞品B的价格
    monitor.add_price_record(PriceRecord(
        date=today,
        product_id="PROD001",
        seller="竞品B",
        original_price=89,
        current_price=89,
        is_promo=False,
        stock_status="有货"
    ))

    # 价格对比
    comparison = monitor.compare_prices("PROD001", my_price=89)
    print("=== 价格对比分析 ===")
    print(f"产品: {comparison['product']}")
    print(f"最低价: ¥{comparison['min_price']}")
    print(f"最高价: ¥{comparison['max_price']}")
    print(f"平均价: ¥{comparison['avg_price']:.1f}")
    print(f"\n我的定位: {comparison.get('my_position', 'N/A')}")
    print(f"建议: {comparison.get('recommendation', 'N/A')}")

    # 检测价格变动
    alerts = monitor.detect_price_changes()
    if alerts:
        print("\n=== 价格预警 ===")
        for alert in alerts:
            print(f"{alert.product_name}: {alert.change_type.value}")
            print(f"  ¥{alert.old_price:.0f} → ¥{alert.new_price:.0f} ({alert.change_percentage:+.1f}%)")


if __name__ == "__main__":
    main()
