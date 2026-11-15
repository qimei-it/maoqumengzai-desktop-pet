#!/usr/bin/env python3
"""
TikTok 选品利润计算器
用于计算TikTok Shop产品的利润率和净利润
"""

from dataclasses import dataclass
from typing import Optional
import json


@dataclass
class ProductInfo:
    """产品信息"""
    name: str
    purchase_cost: float  # 采购成本 (美元)
    weight: float  # 产品重量 (kg)
    selling_price: float  # 售价 (美元)


@dataclass
class LogisticsInfo:
    """物流信息"""
    shipping_method: str = "express"  # express(快递), standard(标准), economy(经济)
    first_mile_cost: float = 0  # 头程运费
    last_mile_cost: float = 0  # 尾程运费
    customs_duty_rate: float = 0  # 关税率 (小数)
    customs_value: float = 0  # 申报价值


@dataclass
class PlatformFees:
    """平台费用"""
    commission_rate: float = 0.05  # 佣金率 (小数)
    payment_fee_rate: float = 0.029  # 支付手续费率 (小数)
    payment_fixed_fee: float = 0.30  # 支付固定费用


@dataclass
class MarketingCosts:
    """营销成本"""
    influencer_commission_rate: float = 0.15  # 达人佣金率
    ad_cost: float = 0  # 广告成本
    return_rate: float = 0.05  # 退货率


class ProfitCalculator:
    """利润计算器"""

    # 各市场默认佣金率
    COMMISSION_RATES = {
        "us": {"min": 0.018, "max": 0.08},  # 美国: 1.8%-8%
        "uk": {"min": 0.04, "max": 0.08},    # 英国: 4%-8%
        "sea": {"min": 0.03, "max": 0.06},   # 东南亚: 3%-6%
    }

    # 支付手续费
    PAYMENT_FEES = {
        "us": {"rate": 0.029, "fixed": 0.30},
        "uk": {"rate": 0.029, "fixed": 0.30},
        "sea": {"rate": 0.03, "fixed": 0.30},
    }

    def __init__(self, market: str = "us"):
        """
        初始化计算器

        Args:
            market: 市场区域 (us/uk/sea)
        """
        self.market = market.lower()
        if self.market not in self.COMMISSION_RATES:
            raise ValueError(f"不支持的市场: {market}")

    def calculate_logistics_cost(self, weight: float, shipping_method: str = "express") -> float:
        """
        计算物流成本

        Args:
            weight: 产品重量 (kg)
            shipping_method: 运输方式

        Returns:
            物流总成本 (美元)
        """
        # 各运输方式单价 (美元/kg)
        shipping_rates = {
            "express": {"first_mile": 5.0, "last_mile": 8.0, "first_weight": 0.5},
            "standard": {"first_mile": 3.0, "last_mile": 5.0, "first_weight": 1.0},
            "economy": {"first_mile": 1.5, "last_mile": 3.0, "first_weight": 2.0},
        }

        rates = shipping_rates.get(shipping_method, shipping_rates["express"])

        # 头程运费
        first_mile = rates["first_mile"] * weight

        # 尾程运费 (简化计算)
        if weight <= rates["first_weight"]:
            last_mile = rates["last_mile"]
        else:
            last_mile = rates["last_mile"] + (weight - rates["first_weight"]) * 2

        return first_mile + last_mile

    def calculate_platform_fees(self, selling_price: float) -> float:
        """
        计算平台费用

        Args:
            selling_price: 售价

        Returns:
            平台总费用
        """
        commission = self.COMMISSION_RATES[self.market]
        # 使用中间值
        commission_fee = selling_price * ((commission["min"] + commission["max"]) / 2)

        payment = self.PAYMENT_FEES[self.market]
        payment_fee = selling_price * payment["rate"] + payment["fixed"]

        return commission_fee + payment_fee

    def calculate_profit(
        self,
        product: ProductInfo,
        logistics: Optional[LogisticsInfo] = None,
        platform: Optional[PlatformFees] = None,
        marketing: Optional[MarketingCosts] = None,
    ) -> dict:
        """
        计算利润

        Args:
            product: 产品信息
            logistics: 物流信息
            platform: 平台费用
            marketing: 营销成本

        Returns:
            利润分析结果
        """
        # 初始化默认值
        if logistics is None:
            logistics = LogisticsInfo()
        if platform is None:
            platform = PlatformFees()
        if marketing is None:
            marketing = MarketingCosts()

        # 1. 计算物流成本
        if logistics.last_mile_cost == 0:
            logistics_cost = self.calculate_logistics_cost(
                product.weight,
                logistics.shipping_method
            )
        else:
            logistics_cost = logistics.first_mile_cost + logistics.last_mile_cost

        # 关税
        customs_duty = product.selling_price * logistics.customs_duty_rate

        # 2. 计算平台费用
        platform_fees = self.calculate_platform_fees(product.selling_price)

        # 3. 达人佣金
        influencer_cost = product.selling_price * marketing.influencer_commission_rate

        # 4. 退货损耗
        return_loss = product.selling_price * marketing.return_rate

        # 5. 其他成本估算 (包装 + 客服)
        other_costs = product.selling_price * 0.02

        # 计算总成本
        total_cost = (
            product.purchase_cost
            + logistics_cost
            + customs_duty
            + platform.fees
            + influencer_cost
            + marketing.ad_cost
            + return_loss
            + other_costs
        )

        # 毛利润
        gross_profit = product.selling_price - product.purchase_cost - logistics_cost - platform_fees - customs_duty

        # 净利润
        net_profit = gross_profit - marketing.ad_cost - influencer_cost - return_loss - other_costs

        # 毛利率
        gross_margin = (gross_profit / product.selling_price) * 100 if product.selling_price > 0 else 0

        # 净利率
        net_margin = (net_profit / product.selling_price) * 100 if product.selling_price > 0 else 0

        # ROI
        roi = (net_profit / total_cost) * 100 if total_cost > 0 else 0

        return {
            "product_name": product.name,
            "selling_price": product.selling_price,
            "total_cost": round(total_cost, 2),
            "gross_profit": round(gross_profit, 2),
            "net_profit": round(net_profit, 2),
            "gross_margin": round(gross_margin, 2),
            "net_margin": round(net_margin, 2),
            "roi": round(roi, 2),
            "cost_breakdown": {
                "purchase_cost": product.purchase_cost,
                "logistics_cost": round(logistics_cost, 2),
                "customs_duty": round(customs_duty, 2),
                "platform_fees": round(platform_fees, 2),
                "influencer_cost": round(influencer_cost, 2),
                "ad_cost": marketing.ad_cost,
                "return_loss": round(return_loss, 2),
                "other_costs": round(other_costs, 2),
            },
            "is_profitable": net_profit > 0,
            "recommendation": self._get_recommendation(net_margin, roi),
        }

    def _get_recommendation(self, net_margin: float, roi: float) -> str:
        """根据利润率获取建议"""
        if net_margin > 30 and roi > 100:
            return "⭐⭐⭐ 强烈推荐 - 高利润产品"
        elif net_margin > 20 and roi > 50:
            return "⭐⭐ 推荐 - 利润可观"
        elif net_margin > 10:
            return "⭐ 可以考虑 - 利润一般"
        elif net_margin > 0:
            return "⚠️ 谨慎 - 利润较低"
        else:
            return "❌ 不推荐 - 亏损产品"

    def calculate_breakeven(self, product: ProductInfo, fixed_cost: float = 100) -> dict:
        """
        计算盈亏平衡点

        Args:
            product: 产品信息
            fixed_cost: 固定成本 (月租、仓储等)

        Returns:
            盈亏平衡分析
        """
        # 估算单件可变成本
        logistics_cost = self.calculate_logistics_cost(product.weight)
        platform_fees = self.calculate_platform_fees(product.selling_price)
        variable_cost = (
            product.purchase_cost
            + logistics_cost
            + platform_fees
            + product.selling_price * 0.05  # 预估其他费用
        )

        # 盈亏平衡销量
        if product.selling_price > variable_cost:
            breakeven_units = fixed_cost / (product.selling_price - variable_cost)
        else:
            breakeven_units = float("inf")

        # 盈亏平衡销售额
        breakeven_sales = breakeven_units * product.selling_price

        return {
            "fixed_cost": fixed_cost,
            "variable_cost_per_unit": round(variable_cost, 2),
            "contribution_margin": round(product.selling_price - variable_cost, 2),
            "breakeven_units": round(breakeven_units, 1),
            "breakeven_sales": round(breakeven_sales, 2),
        }

    def compare_products(self, products: list) -> list:
        """
        比较多个产品

        Args:
            products: 产品列表

        Returns:
            按利润排序的结果
        """
        results = []
        for product in products:
            if isinstance(product, dict):
                product = ProductInfo(**product)
            result = self.calculate_profit(product)
            results.append(result)

        # 按净利润排序
        results.sort(key=lambda x: x["net_profit"], reverse=True)

        return results


def demo():
    """演示"""
    calculator = ProfitCalculator(market="us")

    # 示例产品
    product = ProductInfo(
        name="美容仪",
        purchase_cost=25.0,
        weight=0.8,
        selling_price=79.99
    )

    print("=" * 50)
    print("TikTok 选品利润计算器")
    print("=" * 50)

    # 计算利润
    result = calculator.calculate_profit(product)

    print(f"\n产品: {result['product_name']}")
    print(f"售价: ${result['selling_price']}")
    print(f"总成本: ${result['total_cost']}")
    print(f"毛利润: ${result['gross_profit']}")
    print(f"净利润: ${result['net_profit']}")
    print(f"毛利率: {result['gross_margin']}%")
    print(f"净利率: {result['net_margin']}%")
    print(f"ROI: {result['roi']}%")
    print(f"\n建议: {result['recommendation']}")

    print("\n" + "-" * 50)
    print("成本明细:")
    for key, value in result["cost_breakdown"].items():
        print(f"  {key}: ${value}")

    # 计算盈亏平衡
    print("\n" + "-" * 50)
    breakeven = calculator.calculate_breakeven(product, fixed_cost=200)
    print(f"盈亏平衡点: {breakeven['breakeven_units']:.1f} 件")
    print(f"盈亏平衡销售额: ${breakeven['breakeven_sales']:.2f}")


if __name__ == "__main__":
    demo()
