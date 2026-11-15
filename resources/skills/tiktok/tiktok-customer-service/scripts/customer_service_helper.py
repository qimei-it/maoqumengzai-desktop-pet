#!/usr/bin/env python3
"""
TikTok Customer Service Helper
智能客服助手
"""

import re
import json
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum


class Sentiment(Enum):
    """情绪类型"""
    POSITIVE = "positive"
    NEUTRAL = "neutral"
    ANXIOUS = "anxious"
    FRUSTRATED = "frustrated"
    ANGRY = "angry"


class Category(Enum):
    """咨询类型"""
    LOGISTICS = "logistics"
    PRODUCT = "product"
    AFTER_SALES = "after_sales"
    PROMOTION = "promotion"
    OTHER = "other"


@dataclass
class CustomerContext:
    """客户上下文"""
    order_id: Optional[str] = None
    customer_tier: str = "normal"  # vip, normal, new
    order_count: int = 0
    total_spent: float = 0


@dataclass
class ReplySuggestion:
    """回复建议"""
    content: str
    tone: str
    category: Category
    sentiment: Sentiment
    suggested_actions: List[str] = None


class CustomerServiceHelper:
    """智能客服助手"""

    # 关键词识别规则
    KEYWORD_PATTERNS = {
        Category.LOGISTICS: [
            r"快递|物流|发货|到货|配送|运输|几天|到哪|还没"
        ],
        Category.PRODUCT: [
            r"适合|能用|效果|成分|怎么用|肤质|孕妇|过敏"
        ],
        Category.AFTER_SALES: [
            r"退货|退款|换货|售后|质量问题|破损|投诉"
        ],
        Category.PROMOTION: [
            r"优惠|折扣|活动|促销|券|便宜|活动价"
        ]
    }

    # 情绪关键词
    SENTIMENT_KEYWORDS = {
        Sentiment.ANXIOUS: ["还没", "怎么", "快点", "急"],
        Sentiment.FRUSTRATED: ["太慢", "什么情况", "到底"],
        Sentiment.ANGRY: ["骗子", "垃圾", "投诉", "差评", "退货"],
        Sentiment.POSITIVE: ["谢谢", "好评", "开心", "喜欢"]
    }

    # 回复模板
    REPLY_TEMPLATES = {
        Category.LOGISTICS: {
            Sentiment.NEUTRAL: "亲亲~ 您的宝贝{status}，预计{eta}到达哦~ 📦",
            Sentiment.ANXIOUS: "亲亲您好~ 小白帮您查了一下，您的宝贝{status}啦~ {eta}就能送到您手上哦~ 稍安勿躁，好饭不怕晚嘛 📦✨",
            Sentiment.FRUSTRATED: "抱歉让您久等了~ 我们已经联系快递方核实情况，预计{eta}送达，给您发个5元优惠券补偿一下可以吗？🙏",
            Sentiment.ANGRY: "非常抱歉给您带来不好的体验！我们马上联系快递方紧急处理，稍后会有专人联系您！📞"
        },
        Category.PRODUCT: {
            Sentiment.NEUTRAL: "亲亲~ {answer} ✨",
            Sentiment.ANXIOUS: "亲亲别担心~ {answer}，很多姐妹都用过反馈很好哦~ 💕"
        },
        Category.AFTER_SALES: {
            Sentiment.NEUTRAL: "好的亲亲，{action} ✅",
            Sentiment.FRUSTRATED: "抱歉给您带来不便~ {action}，我们会尽快为您处理~ 🙏",
            Sentiment.ANGRY: "非常抱歉！我们已私信您，希望能有机会补救，一定给您一个满意的解决方案！😔"
        },
        Category.PROMOTION: {
            Sentiment.NEUTRAL: "亲亲，{promo} 🎁",
            Sentiment.POSITIVE: "谢谢亲亲关注~ {promo} 现在下单最划算！🛒"
        }
    }

    # FAQ 知识库
    FAQ_KNOWLEDGE = {
        "什么时候发货": "16:00前下单当天发，16:00后次日发哦~",
        "发什么快递": "默认中通/圆通，下单时可备注指定快递~",
        "能退货吗": "支持7天无理由退换，运费质量问题我们承担~",
        "孕妇能用吗": "建议咨询专业医生，产品成分清单可在详情页查看~",
        "过敏怎么办": "建议先耳后测试，如有不适立即停用并就医~",
        "有优惠吗": "关注店铺领取新人券，还有满减活动哦~",
    }

    @classmethod
    def classify_message(cls, message: str) -> Category:
        """分类客户消息"""
        message_lower = message.lower()

        for category, patterns in cls.KEYWORD_PATTERNS.items():
            for pattern in patterns:
                if re.search(pattern, message_lower):
                    return category

        return Category.OTHER

    @classmethod
    def detect_sentiment(cls, message: str) -> Sentiment:
        """检测客户情绪"""
        # 检查愤怒
        if any(kw in message for kw in cls.SENTIMENT_KEYWORDS[Sentiment.ANGRY]):
            return Sentiment.ANGRY
        # 检查沮丧
        if any(kw in message for kw in cls.SENTIMENT_KEYWORDS[Sentiment.FRUSTRATED]):
            return Sentiment.FRUSTRATED
        # 检查焦虑
        if any(kw in message for kw in cls.SENTIMENT_KEYWORDS[Sentiment.ANXIOUS]):
            return Sentiment.ANXIOUS
        # 检查积极
        if any(kw in message for kw in cls.SENTIMENT_KEYWORDS[Sentiment.POSITIVE]):
            return Sentiment.POSITIVE

        return Sentiment.NEUTRAL

    @classmethod
    def generate_reply(
        cls,
        message: str,
        context: Optional[CustomerContext] = None,
        extra_info: Optional[Dict] = None
    ) -> ReplySuggestion:
        """生成回复建议"""
        category = cls.classify_message(message)
        sentiment = cls.detect_sentiment(message)

        # 获取模板
        template = cls.REPLY_TEMPLATES.get(category, {}).get(
            sentiment,
            cls.REPLY_TEMPLATES[category][Sentiment.NEUTRAL]
        )

        # 填充信息
        if extra_info:
            content = template.format(**extra_info)
        else:
            content = cls._get_faq_answer(message) or template

        # 建议操作
        actions = cls._get_suggested_actions(category, sentiment)

        return ReplySuggestion(
            content=content,
            tone=cls._get_tone(sentiment),
            category=category,
            sentiment=sentiment,
            suggested_actions=actions
        )

    @classmethod
    def generate_review_reply(
        cls,
        rating: int,
        content: str,
        product_name: str
    ) -> List[str]:
        """生成评价回复"""
        replies = []

        if rating >= 4:
            replies.append(
                f"谢谢亲亲的好评~ 看到您满意我们超开心的！"
                f"记得关注我们，后续还有更多新品哦~ ✨"
            )
            if "图" in content or "照片" in content:
                replies.append(
                    "哇~ 拍得真好看！感谢亲亲的用心分享~ 📸"
                )

        elif rating == 3:
            replies.append(
                f"感谢反馈，亲亲觉得哪里不满意呢？"
                f"可以私信告诉我们，我们一定改进~ 📩"
            )

        else:
            replies.append(
                "非常抱歉给您带来不好的体验 😔"
            )
            replies.append(
                "我们已私信您，希望能有机会补救~"
            )

        return replies

    @classmethod
    def _get_faq_answer(cls, question: str) -> Optional[str]:
        """从 FAQ 库获取答案"""
        for q, a in cls.FAQ_KNOWLEDGE.items():
            if q in question or question in q:
                return f"亲亲~ {a}"
        return None

    @classmethod
    def _get_suggested_actions(
        cls,
        category: Category,
        sentiment: Sentiment
    ) -> List[str]:
        """获取建议操作"""
        actions = []

        if category == Category.LOGISTICS:
            actions.extend(["查询物流详情", "联系快递"])
        elif category == Category.AFTER_SALES:
            actions.extend(["申请售后", "联系客服"])
        elif category == Category.PRODUCT:
            actions.extend(["查看详情页", "咨询客服"])

        if sentiment == Sentiment.ANGRY:
            actions.append("升级主管处理")

        return actions

    @classmethod
    def _get_tone(cls, sentiment: Sentiment) -> str:
        """获取回复语气"""
        tone_map = {
            Sentiment.POSITIVE: "enthusiastic",
            Sentiment.NEUTRAL: "friendly",
            Sentiment.ANXIOUS: "reassuring",
            Sentiment.FRUSTRATED: "apologetic",
            Sentiment.ANGRY: "sincere_apologetic"
        }
        return tone_map.get(sentiment, "friendly")


def main():
    """示例使用"""
    helper = CustomerServiceHelper()

    # 示例1: 物流咨询
    message1 = "我的快递怎么还没到？"
    reply1 = helper.generate_reply(
        message1,
        extra_info={"status": "已到达杭州转运中心", "eta": "明天"}
    )
    print(f"客户: {message1}")
    print(f"回复: {reply1.content}\n")

    # 示例2: 差评回复
    review = "色差太大，图片是骗人的！"
    review_replies = helper.generate_review_reply(1, review, "口红")
    print(f"评价: {review}")
    for r in review_replies:
        print(f"回复: {r}")


if __name__ == "__main__":
    main()
