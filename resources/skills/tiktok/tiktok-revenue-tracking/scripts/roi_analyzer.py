#!/usr/bin/env python3
"""
TikTok ROI Analyzer
ROI 分析脚本
"""

from typing import Dict, List, Optional
from dataclasses import dataclass
from datetime import date


@dataclass
class ROIMetrics:
    """ROI 指标"""
    revenue: float
    cost: float
    profit: float
    roi: float
    roi_percentage: float


class ROIAnalyzer:
    """ROI 分析器"""

    # 行业基准
    INDUSTRY_BENCHMARKS = {
        "自营店铺": 3.0,      # 300%
        "达人带货": 2.5,      # 250%
        "广告投放": 2.0,      # 200%
        "直播": 2.8          # 280%
    }

    @staticmethod
    def calculate_ad_roi(
        ad_spend: float,
        generated_sales: float,
        product_cost_ratio: float = 0.4
    ) -> ROIMetrics:
        """
        计算广告投放 ROI

        Args:
            ad_spend: 广告费用
            generated_sales: 广告带来的销售额
            product_cost_ratio: 产品成本占比

        Returns:
            ROI 指标
        """
        cost = ad_spend + (generated_sales * product_cost_ratio)
        profit = generated_sales - cost

        if ad_spend == 0:
            roi = 0
        else:
            roi = (generated_sales - cost) / ad_spend

        return ROIMetrics(
            revenue=generated_sales,
            cost=cost,
            profit=profit,
            roi=roi,
            roi_percentage=roi * 100
        )

    @staticmethod
    def calculate_influencer_roi(
        gmv: float,
        commission_rate: float,
        sample_cost: float,
        product_cost_ratio: float = 0.3
    ) -> ROIMetrics:
        """
        计算达人带货 ROI

        Args:
            gmv: 带货 GMV
            commission_rate: 佣金率
            sample_cost: 样品成本
            product_cost_ratio: 产品成本占比

        Returns:
            ROI 指标
        """
        commission = gmv * commission_rate
        product_cost = gmv * product_cost_ratio
        total_cost = commission + sample_cost + product_cost

        profit = gmv - total_cost

        if total_cost == 0:
            roi = 0
        else:
            roi = profit / total_cost

        return ROIMetrics(
            revenue=gmv,
            cost=total_cost,
            profit=profit,
            roi=roi,
            roi_percentage=roi * 100
        )

    @staticmethod
    def compare_with_benchmark(
        roi: float,
        channel: str
    ) -> Dict:
        """
        与行业基准对比

        Args:
            roi: 计算出的 ROI
            channel: 渠道类型

        Returns:
            对比结果
        """
        benchmark = ROIAnalyzer.INDUSTRY_BENCHMARKS.get(channel, 2.0)

        diff = roi - benchmark
        diff_percentage = (roi - benchmark) / benchmark * 100 if benchmark > 0 else 0

        # 判断表现
        if roi >= benchmark * 1.2:
            performance = "优秀"
        elif roi >= benchmark:
            performance = "良好"
        elif roi >= benchmark * 0.8:
            performance = "一般"
        else:
            performance = "需优化"

        return {
            "current_roi": roi,
            "benchmark": benchmark,
            "difference": diff,
            "difference_percentage": diff_percentage,
            "performance": performance
        }

    @staticmethod
    def generate_optimization_suggestions(
        roi: float,
        channel: str,
        metrics: Dict
    ) -> List[str]:
        """
        生成优化建议

        Args:
            roi: 当前 ROI
            channel: 渠道类型
            metrics: 相关指标数据

        Returns:
            优化建议列表
        """
        suggestions = []

        benchmark = ROIAnalyzer.INDUSTRY_BENCHMARKS.get(channel, 2.0)

        if roi < benchmark:
            suggestions.append(f"当前 ROI ({roi:.2f}) 低于行业基准 ({benchmark:.2f})，建议优化")

        # 根据渠道生成具体建议
        if channel == "广告投放":
            if metrics.get("ctr", 0) < 0.02:
                suggestions.append("点击率偏低，建议优化广告创意和素材")
            if metrics.get("conversion_rate", 0) < 0.03:
                suggestions.append("转化率偏低，建议优化落地页和产品详情")

        elif channel == "达人带货":
            if metrics.get("gmv", 0) < 10000:
                suggestions.append("GMV 偏低，建议考虑合作粉丝量更大的达人")
            if metrics.get("commission_rate", 0) > 0.3:
                suggestions.append("佣金率偏高，可尝试协商降低")

        elif channel == "自营店铺":
            if metrics.get("traffic", 0) < 1000:
                suggestions.append("流量偏低，建议加强内容营销和 SEO 优化")
            if metrics.get("conversion_rate", 0) < 0.02:
                suggestions.append("转化率偏低，建议优化商品详情和促销活动")

        # 通用建议
        if roi < 1:
            suggestions.append("⚠️ ROI 低于 1，处于亏损状态，建议暂停或大幅优化")

        return suggestions


def main():
    """示例使用"""
    analyzer = ROIAnalyzer()

    # 广告 ROI 分析
    ad_metrics = analyzer.calculate_ad_roi(
        ad_spend=10000,
        generated_sales=45000
    )

    print("=== 广告投放 ROI 分析 ===")
    print(f"销售额: ¥{ad_metrics.revenue:,.2f}")
    print(f"总成本: ¥{ad_metrics.cost:,.2f}")
    print(f"利润: ¥{ad_metrics.profit:,.2f}")
    print(f"ROI: {ad_metrics.roi:.2f} ({ad_metrics.roi_percentage:.1f}%)")

    # 与基准对比
    comparison = analyzer.compare_with_benchmark(ad_metrics.roi, "广告投放")
    print(f"\n行业对比: {comparison['performance']}")
    print(f"当前 ROI: {comparison['current_roi']:.2f}")
    print(f"行业基准: {comparison['benchmark']:.2f}")
    print(f"差异: {comparison['difference_percentage']:+.1f}%")

    # 优化建议
    suggestions = analyzer.generate_optimization_suggestions(
        ad_metrics.roi,
        "广告投放",
        {"ctr": 0.015, "conversion_rate": 0.025}
    )
    print("\n优化建议:")
    for s in suggestions:
        print(f"  • {s}")


if __name__ == "__main__":
    main()
