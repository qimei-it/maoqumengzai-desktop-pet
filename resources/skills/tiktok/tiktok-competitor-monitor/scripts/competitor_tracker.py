#!/usr/bin/env python3
"""
TikTok Competitor Tracker
竞品追踪脚本
"""

from typing import List, Dict, Optional
from dataclasses import dataclass
from datetime import date, timedelta
from enum import Enum


class ContentType(Enum):
    """内容类型"""
    REVIEW = "测评"
    TUTORIAL = "教程"
    STORY = "剧情"
    PROMOTION = "推广"
    CHALLENGE = "挑战"
    OTHER = "其他"


@dataclass
class VideoStats:
    """视频数据"""
    video_id: str
    title: str
    publish_date: date
    views: int
    likes: int
    comments: int
    shares: int
    content_type: ContentType
    duration: int  # 秒


@dataclass
class AccountSnapshot:
    """账号快照"""
    date: date
    followers: int
    following: int
    total_likes: int
    total_videos: int


@dataclass
class CompetitorProfile:
    """竞品档案"""
    account_id: str
    username: str
    display_name: str
    niche: str  # 品类/领域
    snapshots: List[AccountSnapshot]
    videos: List[VideoStats]


class CompetitorTracker:
    """竞品追踪器"""

    # 爆款识别阈值
    VIRAL_THRESHOLDS = {
        "min_views": 100000,
        "min_like_rate": 0.05,
        "min_comments": 1000,
        "min_shares": 500
    }

    # 账号健康度基准
    HEALTH_BENCHMARKS = {
        "follower_growth_rate": 0.05,  # 5%
        "engagement_rate": 0.08,        # 8%
        "viral_rate": 0.10,             # 10%
        "update_frequency": 0.5         # 0.5 视频/天
    }

    def __init__(self):
        self.competitors: Dict[str, CompetitorProfile] = {}

    def add_competitor(self, profile: CompetitorProfile):
        """添加竞品"""
        self.competitors[profile.account_id] = profile

    def calculate_follower_growth(
        self,
        account_id: str,
        days: int = 7
    ) -> Dict:
        """计算粉丝增长率"""
        profile = self.competitors.get(account_id)
        if not profile or len(profile.snapshots) < 2:
            return {"error": "Insufficient data"}

        # 获取最新的两个快照
        sorted_snapshots = sorted(
            profile.snapshots,
            key=lambda s: s.date,
            reverse=True
        )

        latest = sorted_snapshots[0]
        previous = sorted_snapshots[1]

        growth = latest.followers - previous.followers
        growth_rate = growth / previous.followers if previous.followers > 0 else 0

        return {
            "previous_followers": previous.followers,
            "current_followers": latest.followers,
            "growth": growth,
            "growth_rate": growth_rate * 100,  # 百分比
            "days_ago": (latest.date - previous.date).days
        }

    def calculate_engagement_rate(
        self,
        account_id: str,
        recent_videos: int = 20
    ) -> Dict:
        """计算互动率"""
        profile = self.competitors.get(account_id)
        if not profile:
            return {"error": "Competitor not found"}

        # 取最近的视频
        videos = sorted(
            profile.videos,
            key=lambda v: v.publish_date,
            reverse=True
        )[:recent_videos]

        if not videos:
            return {"error": "No videos found"}

        total_views = sum(v.views for v in videos)
        total_likes = sum(v.likes for v in videos)
        total_comments = sum(v.comments for v in videos)
        total_shares = sum(v.shares for v in videos)

        engagement_rate = (
            (total_likes + total_comments + total_shares) / total_views
            if total_views > 0 else 0
        )

        like_rate = total_likes / total_views if total_views > 0 else 0
        comment_rate = total_comments / total_views if total_views > 0 else 0
        share_rate = total_shares / total_views if total_views > 0 else 0

        return {
            "engagement_rate": engagement_rate * 100,
            "like_rate": like_rate * 100,
            "comment_rate": comment_rate * 100,
            "share_rate": share_rate * 100,
            "videos_analyzed": len(videos)
        }

    def identify_viral_videos(
        self,
        account_id: str,
        days: int = 30
    ) -> List[VideoStats]:
        """识别爆款视频"""
        profile = self.competitors.get(account_id)
        if not profile:
            return []

        cutoff_date = date.today() - timedelta(days=days)

        viral_videos = []
        for video in profile.videos:
            if video.publish_date < cutoff_date:
                continue

            # 检查是否达到爆款标准
            is_viral = True

            if video.views < self.VIRAL_THRESHOLDS["min_views"]:
                is_viral = False
            elif video.likes / video.views < self.VIRAL_THRESHOLDS["min_like_rate"]:
                is_viral = False
            elif video.comments < self.VIRAL_THRESHOLDS["min_comments"]:
                is_viral = False
            elif video.shares < self.VIRAL_THRESHOLDS["min_shares"]:
                is_viral = False

            if is_viral:
                viral_videos.append(video)

        return sorted(viral_videos, key=lambda v: v.views, reverse=True)

    def analyze_content_strategy(
        self,
        account_id: str,
        days: int = 30
    ) -> Dict:
        """分析内容策略"""
        profile = self.competitors.get(account_id)
        if not profile:
            return {"error": "Competitor not found"}

        cutoff_date = date.today() - timedelta(days=days)
        recent_videos = [
            v for v in profile.videos
            if v.publish_date >= cutoff_date
        ]

        if not recent_videos:
            return {"error": "No recent videos found"}

        # 内容类型分布
        type_distribution = {}
        for video in recent_videos:
            content_type = video.content_type.value
            type_distribution[content_type] = (
                type_distribution.get(content_type, 0) + 1
            )

        total = len(recent_videos)
        for t in type_distribution:
            type_distribution[t] = {
                "count": type_distribution[t],
                "percentage": type_distribution[t] / total * 100
            }

        # 视频时长分布
        durations = [v.duration for v in recent_videos]
        avg_duration = sum(durations) / len(durations) if durations else 0

        # 发布频率
        if len(recent_videos) > 1:
            date_range = (
                recent_videos[0].publish_date - recent_videos[-1].publish_date
            ).days + 1
            update_frequency = len(recent_videos) / date_range if date_range > 0 else 0
        else:
            update_frequency = 0

        # 发布时间分析
        publish_hours = [v.publish_date.hour for v in recent_videos if hasattr(v.publish_date, 'hour')]
        peak_hours = {}
        for hour in publish_hours:
            peak_hours[hour] = peak_hours.get(hour, 0) + 1

        return {
            "content_types": type_distribution,
            "avg_duration": avg_duration,
            "update_frequency": update_frequency,
            "total_videos": total,
            "peak_publish_hours": sorted(
                peak_hours.items(),
                key=lambda x: x[1],
                reverse=True
            )[:3]
        }

    def generate_competitor_report(
        self,
        account_id: str
    ) -> Dict:
        """生成竞品分析报告"""
        profile = self.competitors.get(account_id)
        if not profile:
            return {"error": "Competitor not found"}

        # 收集各项数据
        growth_data = self.calculate_follower_growth(account_id)
        engagement_data = self.calculate_engagement_rate(account_id)
        viral_videos = self.identify_viral_videos(account_id)
        strategy_data = self.analyze_content_strategy(account_id)

        # 判断健康度
        health_score = 0
        health_checks = []

        if "growth_rate" in growth_data:
            if growth_data["growth_rate"] >= self.HEALTH_BENCHMARKS["follower_growth_rate"] * 100:
                health_score += 1
                health_checks.append("✅ 粉丝增长健康")
            else:
                health_checks.append("⚠️ 粉丝增长缓慢")

        if "engagement_rate" in engagement_data:
            if engagement_data["engagement_rate"] >= self.HEALTH_BENCHMARKS["engagement_rate"] * 100:
                health_score += 1
                health_checks.append("✅ 互动率优秀")
            else:
                health_checks.append("⚠️ 互动率一般")

        if "viral_rate" in strategy_data:
            actual_viral_rate = len(viral_videos) / strategy_data.get("total_videos", 1)
            if actual_viral_rate >= self.HEALTH_BENCHMARKS["viral_rate"]:
                health_score += 1
                health_checks.append("✅ 爆款产出健康")
            else:
                health_checks.append("⚠️ 爆款产出偏低")

        return {
            "competitor": profile.display_name,
            "account_id": account_id,
            "health_score": health_score,
            "health_checks": health_checks,
            "follower_growth": growth_data,
            "engagement": engagement_data,
            "viral_videos_count": len(viral_videos),
            "content_strategy": strategy_data
        }


def main():
    """示例使用"""
    tracker = CompetitorTracker()

    # 创建示例竞品数据
    from datetime import timedelta

    profile = CompetitorProfile(
        account_id="comp001",
        username="@competitor_a",
        display_name="竞品A账号",
        niche="美妆"
    )

    # 添加快照
    today = date.today()
    profile.snapshots.append(AccountSnapshot(
        date=today - timedelta(days=7),
        followers=450000,
        following=200,
        total_likes=5000000,
        total_videos=150
    ))

    profile.snapshots.append(AccountSnapshot(
        date=today,
        followers=480000,
        following=210,
        total_likes=5500000,
        total_videos=155
    ))

    # 添加视频数据
    for i in range(10):
        video = VideoStats(
            video_id=f"vid{i}",
            title=f"视频{i}",
            publish_date=today - timedelta(days=i),
            views=50000 + i * 10000,
            likes=3000 + i * 600,
            comments=200 + i * 40,
            shares=100 + i * 20,
            content_type=ContentType.REVIEW,
            duration=45
        )
        profile.videos.append(video)

    tracker.add_competitor(profile)

    # 生成报告
    report = tracker.generate_competitor_report("comp001")
    print("=== 竞品分析报告 ===")
    print(f"账号: {report['competitor']}")
    print(f"健康度: {report['health_score']}/3")
    print("\n健康检查:")
    for check in report['health_checks']:
        print(f"  {check}")


if __name__ == "__main__":
    main()
