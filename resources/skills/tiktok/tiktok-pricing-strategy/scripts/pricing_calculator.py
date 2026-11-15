#!/usr/bin/env python3
"""
TikTok Pricing Strategy Calculator
定价策略计算器
"""

import math
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass


@dataclass
class ProductInfo:
    """产品信息"""
    name: str
    cost: float
    category: str
    original_price: Optional[float] = None


@dataclass
class InfluencerInfo:
    """达人信息"""
    followers: int
    engagement_rate: float
    niche: str


@dataclass
class CompetitorPrice:
    """竞品价格"""
    name: str
    price: float
    sales: int = 0
    rating: float = 0.0


class PricingCalculator:
    """定价计算器"""

    # 行业基准数据
    CATEGORY_MULTIPLIERS = {
        "美妆护肤": 2.5,
        "服饰鞋包": 2.2,
        "食品饮料": 1.8,
        "家居百货": 1.6,
        "3C数码": 1.3,
    }

    INFLUENCER_CPM_RANGES = {
        "美妆": (300, 600),
        "服饰": (200, 400),
        "食品": (150, 300),
        "生活": (100, 250),
        "其他": (100, 200),
    }

    @staticmethod
    def cost_plus_pricing(product: ProductInfo, target_margin: float = 0.4) -> float:
        """
        成本加成定价法

        Args:
            product: 产品信息
            target_margin: 目标利润率 (默认40%)

        Returns:
            建议售价
        """
        multiplier = PricingCalculator.CATEGORY_MULTIPLIERS.get(
            product.category, 2.0
        )
        return round(product.cost * multiplier, 2)

    @staticmethod
    def competitor_based_pricing(
        product: ProductInfo,
        competitors: List[CompetitorPrice],
        position: str = "middle"
    ) -> float:
        """
        竞争导向定价法

        Args:
            product: 产品信息
            competitors: 竞品价格列表
            position: 定位策略 (low/middle/high)

        Returns:
            建议售价
        """
        if not competitors:
            return PricingCalculator.cost_plus_pricing(product)

        prices = [c.price for c in competitors]
        avg_price = sum(prices) / len(prices)

        position_multipliers = {
            "low": 0.85,
            "middle": 1.0,
            "high": 1.15
        }

        return round(avg_price * position_multipliers[position], 2)

    @staticmethod
    def psychological_pricing(price: float) -> int:
        """
        心理定价

        Args:
            price: 原始价格

        Returns:
            心理定价后的价格
        """
        # 取整到9或99
        if price < 10:
            return int(math.floor(price))
        elif price < 100:
            return int(math.floor(price / 10) * 10 - 1)
        else:
            return int(math.floor(price / 10) * 10 - 1)

    @staticmethod
    def calculate_profit(
        sale_price: float,
        cost: float,
        commission_rate: float = 0.2,
        shipping: float = 5
    ) -> Dict[str, float]:
        """
        计算利润

        Args:
            sale_price: 售价
            cost: 成本
            commission_rate: 佣金率
            shipping: 物流成本

        Returns:
            利润分析字典
        """
        platform_fee = sale_price * 0.05  # TikTok 平台扣点5%
        commission = sale_price * commission_rate
        total_cost = cost + platform_fee + commission + shipping
        profit = sale_price - total_cost
        profit_margin = profit / sale_price if sale_price > 0 else 0

        return {
            "sale_price": sale_price,
            "cost": cost,
            "platform_fee": platform_fee,
            "commission": commission,
            "shipping": shipping,
            "total_cost": total_cost,
            "profit": profit,
            "profit_margin": profit_margin
        }

    @staticmethod
    def influencer_quote(
        influencer: InfluencerInfo,
        content_type: str = "video",
        duration: int = 60
    ) -> Dict:
        """
        达人报价计算

        Args:
            influencer: 达人信息
            content_type: 内容类型
            duration: 视频时长(秒)

        Returns:
            报价建议
        """
        # 计算有效互动量
        engaged_audience = influencer.followers * influencer.engagement_rate

        # 获取行业 CPM 范围
        cpm_min, cpm_max = PricingCalculator.INFLUENCER_CPM_RANGES.get(
            influencer.niche, (200, 500)
        )

        # 根据互动率调整 CPM
        engagement_multiplier = min(
            max(influencer.engagement_rate / 0.05, 0.8), 1.5
        )

        base_cpm = (cpm_min + cpm_max) / 2 * engagement_multiplier

        # 计算基础报价
        base_quote = (engaged_audience / 1000) * base_cpm

        # 内容复杂度调整
        complexity_multipliers = {
            "video": 1.0,
            "live": 0.6,
            "image": 0.5
        }

        complexity_mult = complexity_multipliers.get(content_type, 1.0)

        # 最终报价
        recommended = round(base_quote * complexity_mult)
        quote_range = (
            round(recommended * 0.9),
            round(recommended * 1.1)
        )
        cpm = round(recommended / (engaged_audience / 1000))

        # 粉丝量级分类
        if influencer.followers < 100000:
            tier = "KOC/微达人"
        elif influencer.followers < 500000:
            tier = "中腰部达人"
        elif influencer.followers < 1000000:
            tier = "腰部达人"
        else:
            tier = "头部达人"

        return {
            "tier": tier,
            "recommended": recommended,
            "range": quote_range,
            "cpm": cpm,
            "engaged_audience": int(engaged_audience),
            "breakdown": {
                "base_rate": round(base_quote),
                "engagement_adjustment": round(base_quote * (engagement_multiplier - 1))
            }
        }

    @staticmethod
    def promotion_analysis(
        original_price: float,
        cost: float,
        inventory: int,
        target_sales: int,
        min_profit_margin: float = 0.2
    ) -> List[Dict]:
        """
        促销方案分析

        Args:
            original_price: 原价
            cost: 成本
            inventory: 库存
            target_sales: 目标销量
            min_profit_margin: 最低利润率

        Returns:
            可行的促销方案列表
        """
        schemes = []

        # 方案1: 直接折扣
        for discount in [0.9, 0.8, 0.7, 0.6]:
            sale_price = original_price * discount
            profit_analysis = PricingCalculator.calculate_profit(sale_price, cost)

            if profit_analysis["profit_margin"] >= min_profit_margin:
                # 估算销量提升
                sales_boost = 1 + (1 - discount) * 3  # 折扣越大销量提升越多
                expected_sales = min(inventory, int(target_sales * sales_boost))

                schemes.append({
                    "name": f"{int(discount * 10)}折优惠",
                    "type": "discount",
                    "discount": discount,
                    "sale_price": round(sale_price),
                    "profit_margin": profit_analysis["profit_margin"],
                    "expected_sales": expected_sales,
                    "total_profit": round(profit_analysis["profit"] * expected_sales)
                })

        # 方案2: 满减
        for threshold, reduction in [(200, 30), (300, 50), (500, 100)]:
            if original_price > threshold:
                effective_price = original_price - reduction
                profit_analysis = PricingCalculator.calculate_profit(effective_price, cost)

                if profit_analysis["profit_margin"] >= min_profit_margin:
                    schemes.append({
                        "name": f"满{threshold}减{reduction}",
                        "type": "threshold",
                        "sale_price": round(effective_price),
                        "profit_margin": profit_analysis["profit_margin"],
                        "expected_sales": int(target_sales * 1.2),
                        "total_profit": round(profit_analysis["profit"] * target_sales * 1.2)
                    })

        # 方案3: 买赠
        for buy, free in [(2, 1), (3, 1), (1, 1)]:
            effective_price = original_price * buy / (buy + free)
            profit_analysis = PricingCalculator.calculate_profit(effective_price, cost)

            if profit_analysis["profit_margin"] >= min_profit_margin:
                schemes.append({
                    "name": f"买{buy}送{free}",
                    "type": "bundle",
                    "sale_price": round(effective_price),
                    "profit_margin": profit_analysis["profit_margin"],
                    "expected_sales": int(target_sales * (buy + free) / buy * 1.5),
                    "total_profit": round(profit_analysis["profit"] * target_sales * 1.5)
                })

        # 按总利润排序
        schemes.sort(key=lambda x: x["total_profit"], reverse=True)
        return schemes[:5]


def main():
    """示例使用"""
    # 产品定价示例
    product = ProductInfo(
        name="润唇膏",
        cost=35,
        category="美妆护肤"
    )

    print("=== 产品定价分析 ===")
    print(f"成本加成定价: ¥{PricingCalculator.cost_plus_pricing(product)}")

    # 达人报价示例
    influencer = InfluencerInfo(
        followers=500000,
        engagement_rate=0.08,
        niche="美妆"
    )

    print("\n=== 达人报价分析 ===")
    quote = PricingCalculator.influencer_quote(influencer)
    print(f"达人级别: {quote['tier']}")
    print(f"建议报价: ¥{quote['recommended']:,}")
    print(f"报价区间: ¥{quote['range'][0]:,} - ¥{quote['range'][1]:,}")
    print(f"CPM: ¥{quote['cpm']}")


if __name__ == "__main__":
    main()
