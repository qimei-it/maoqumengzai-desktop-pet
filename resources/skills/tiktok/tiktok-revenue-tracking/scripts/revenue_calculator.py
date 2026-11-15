#!/usr/bin/env python3
"""
TikTok Revenue Calculator
收入计算脚本
"""

from typing import List, Dict, Optional
from dataclasses import dataclass
from datetime import datetime, date
from enum import Enum


class RevenueSource(Enum):
    """收入来源"""
    SPONSORSHIP = "商单"
    COMMISSION = "带货佣金"
    AD = "广告收入"
    LIVE = "直播打赏"
    OTHER = "其他"


@dataclass
class RevenueRecord:
    """收入记录"""
    date: date
    source: RevenueSource
    amount: float
    platform: str = "TikTok"
    description: str = ""
    commission_rate: Optional[float] = None
    product_id: Optional[str] = None


class RevenueCalculator:
    """收入计算器"""

    def __init__(self):
        self.records: List[RevenueRecord] = []

    def add_record(self, record: RevenueRecord):
        """添加收入记录"""
        self.records.append(record)

    def summarize_by_source(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict[str, Dict]:
        """按来源汇总收入"""
        filtered = self._filter_by_date(start_date, end_date)

        summary = {}
        total = 0

        for record in filtered:
            source = record.source.value
            if source not in summary:
                summary[source] = {"amount": 0, "count": 0}
            summary[source]["amount"] += record.amount
            summary[source]["count"] += 1
            total += record.amount

        # 计算占比
        for source in summary:
            summary[source]["percentage"] = (
                summary[source]["amount"] / total * 100 if total > 0 else 0
            )

        return {
            "by_source": summary,
            "total": total
        }

    def calculate_growth_rate(
        self,
        period1: tuple[date, date],
        period2: tuple[date, date]
    ) -> Dict[str, float]:
        """计算增长率"""
        summary1 = self.summarize_by_source(*period1)
        summary2 = self.summarize_by_source(*period2)

        total1 = summary1["total"]
        total2 = summary2["total"]

        if total1 == 0:
            return {"growth_rate": float('inf')}

        growth_rate = (total2 - total1) / total1 * 100

        return {
            "period1_total": total1,
            "period2_total": total2,
            "growth_rate": growth_rate
        }

    def generate_monthly_report(
        self,
        year: int,
        month: int
    ) -> Dict:
        """生成月度报告"""
        from calendar import monthrange

        start_date = date(year, month, 1)
        end_date = date(year, month, monthrange(year, month)[1])

        summary = self.summarize_by_source(start_date, end_date)

        # 计算日均值
        days_in_month = monthrange(year, month)[1]
        daily_average = summary["total"] / days_in_month

        return {
            "period": f"{year}-{month:02d}",
            "summary": summary["by_source"],
            "total": summary["total"],
            "daily_average": daily_average,
            "record_count": len(self._filter_by_date(start_date, end_date))
        }

    def _filter_by_date(
        self,
        start_date: Optional[date],
        end_date: Optional[date]
    ) -> List[RevenueRecord]:
        """按日期过滤记录"""
        filtered = self.records

        if start_date:
            filtered = [r for r in filtered if r.date >= start_date]
        if end_date:
            filtered = [r for r in filtered if r.date <= end_date]

        return filtered


# 商家销售记录
@dataclass
class SalesRecord:
    """销售记录"""
    date: date
    channel: str  # 自营/达人/直播/广告
    gmv: float
    cost: float
    commission: float = 0
    ad_spend: float = 0
    influencer_id: Optional[str] = None


class GMVCalculator:
    """GMV 计算器"""

    def __init__(self):
        self.records: List[SalesRecord] = []

    def add_record(self, record: SalesRecord):
        """添加销售记录"""
        self.records.append(record)

    def summarize_by_channel(
        self,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> Dict:
        """按渠道汇总 GMV"""
        filtered = self._filter_by_date(start_date, end_date)

        summary = {}
        total_gmv = 0
        total_profit = 0

        for record in filtered:
            if record.channel not in summary:
                summary[record.channel] = {
                    "gmv": 0,
                    "cost": 0,
                    "commission": 0,
                    "ad_spend": 0,
                    "profit": 0,
                    "count": 0
                }

            profit = record.gmv - record.cost - record.commission - record.ad_spend

            summary[record.channel]["gmv"] += record.gmv
            summary[record.channel]["cost"] += record.cost
            summary[record.channel]["commission"] += record.commission
            summary[record.channel]["ad_spend"] += record.ad_spend
            summary[record.channel]["profit"] += profit
            summary[record.channel]["count"] += 1

            total_gmv += record.gmv
            total_profit += profit

        # 计算占比
        for channel in summary:
            summary[channel]["gmv_percentage"] = (
                summary[channel]["gmv"] / total_gmv * 100 if total_gmv > 0 else 0
            )

        return {
            "by_channel": summary,
            "total_gmv": total_gmv,
            "total_profit": total_profit
        }

    def _filter_by_date(
        self,
        start_date: Optional[date],
        end_date: Optional[date]
    ) -> List[SalesRecord]:
        """按日期过滤记录"""
        filtered = self.records

        if start_date:
            filtered = [r for r in filtered if r.date >= start_date]
        if end_date:
            filtered = [r for r in filtered if r.date <= end_date]

        return filtered


def main():
    """示例使用"""
    # 达人收入示例
    calc = RevenueCalculator()

    from datetime import timedelta
    today = date.today()

    # 添加示例数据
    calc.add_record(RevenueRecord(
        date=today - timedelta(days=5),
        source=RevenueSource.SPONSORSHIP,
        amount=15000,
        description="美妆品牌合作"
    ))

    calc.add_record(RevenueRecord(
        date=today - timedelta(days=10),
        source=RevenueSource.COMMISSION,
        amount=8500,
        commission_rate=0.2,
        product_id="PROD001"
    ))

    # 生成报告
    report = calc.generate_monthly_report(today.year, today.month)
    print("=== 月度收入报告 ===")
    print(f"总收入: ¥{report['total']:,.2f}")
    print(f"日均收入: ¥{report['daily_average']:,.2f}")
    print("\n收入来源:")
    for source, data in report['summary'].items():
        print(f"  {source}: ¥{data['amount']:,.2f} ({data['percentage']:.1f}%)")


if __name__ == "__main__":
    main()
