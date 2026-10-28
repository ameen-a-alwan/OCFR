"""Public Arabic cybersecurity / AI assistant API."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.activity import log_activity
from app.core.auth import OptionalUser
from app.core.rate_limit import SlidingWindowRateLimiter, client_ip
from app.services.assistant import generate_assistant_reply

router = APIRouter()

# Public soft limit to protect Gemini quota (per IP)
_assistant_limiter = SlidingWindowRateLimiter(max_calls=20, window_seconds=600)


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    history: list[ChatMessage] = Field(default_factory=list, max_length=20)


class ChatResponse(BaseModel):
    reply: str
    sources: list[dict[str, str]] = Field(default_factory=list)


@router.post("/chat", response_model=ChatResponse)
async def assistant_chat(
    body: ChatRequest, request: Request, user: OptionalUser
) -> ChatResponse:
    _assistant_limiter.check(f"assistant:{client_ip(request)}")
    msg = body.message.strip()
    if not msg:
        raise HTTPException(status_code=400, detail="الرسالة فارغة")
    history = [
        {"role": m.role, "content": m.content.strip()[:4000]}
        for m in body.history[-16:]
        if m.content.strip()
    ]
    try:
        result = await generate_assistant_reply(message=msg, history=history)
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502, detail="تعذّر الحصول على إجابة من المساعد"
        ) from exc
    log_activity(
        request,
        action="assistant_chat",
        category="assistant",
        detail=f"سؤال للمساعد: {msg[:120]}",
        user=user,
    )
    return ChatResponse(reply=result["reply"], sources=result.get("sources") or [])
