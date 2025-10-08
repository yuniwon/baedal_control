"""Common error codes referenced by connectors and orchestrator."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict


class ErrorSeverity(str, Enum):
    HIGH = "High"
    MEDIUM = "Medium"
    LOW = "Low"
    INFO = "Info"


@dataclass(frozen=True)
class ErrorDescriptor:
    code: str
    severity: ErrorSeverity
    reason: str
    recovery: str
    user_hint: str


ERRORS: Dict[str, ErrorDescriptor] = {
    "AUTH_INVALID": ErrorDescriptor(
        code="AUTH_INVALID",
        severity=ErrorSeverity.HIGH,
        reason="Credential rejected by platform",
        recovery="Request credential refresh from user",
        user_hint="설정에서 자격증명을 갱신해 주세요.",
    ),
    "AUTH_2FA_REQUIRED": ErrorDescriptor(
        code="AUTH_2FA_REQUIRED",
        severity=ErrorSeverity.MEDIUM,
        reason="OTP input required",
        recovery="Prompt operator for OTP",
        user_hint="2단계 인증 코드를 입력하면 계속됩니다.",
    ),
    "CAPTCHA_BLOCKED": ErrorDescriptor(
        code="CAPTCHA_BLOCKED",
        severity=ErrorSeverity.HIGH,
        reason="Captcha challenge detected",
        recovery="Escalate to human-in-the-loop",
        user_hint="캡차를 해결한 뒤 다시 시도해 주세요.",
    ),
    "SELECTOR_MISSING": ErrorDescriptor(
        code="SELECTOR_MISSING",
        severity=ErrorSeverity.HIGH,
        reason="DOM selector does not match",
        recovery="Switch selector version or patch",
        user_hint="새로운 커넥터 버전을 배포할 때까지 대기해 주세요.",
    ),
    "ELEMENT_NOT_INTERACTABLE": ErrorDescriptor(
        code="ELEMENT_NOT_INTERACTABLE",
        severity=ErrorSeverity.MEDIUM,
        reason="Element not interactable in UI",
        recovery="Scroll or wait before retry",
        user_hint="화면을 스크롤한 뒤 다시 시도해 주세요.",
    ),
    "TOAST_ERROR": ErrorDescriptor(
        code="TOAST_ERROR",
        severity=ErrorSeverity.MEDIUM,
        reason="Platform returned form validation error",
        recovery="Adjust payload and retry",
        user_hint="오류 항목을 확인한 뒤 수정해 주세요.",
    ),
    "RATE_LIMIT": ErrorDescriptor(
        code="RATE_LIMIT",
        severity=ErrorSeverity.MEDIUM,
        reason="Too many requests",
        recovery="Exponential backoff",
        user_hint="잠시 후 자동 재시도됩니다.",
    ),
    "TIMEOUT": ErrorDescriptor(
        code="TIMEOUT",
        severity=ErrorSeverity.MEDIUM,
        reason="Operation timed out",
        recovery="Retry up to two times",
        user_hint="네트워크 상태를 확인해 주세요.",
    ),
    "UPLOAD_FAIL": ErrorDescriptor(
        code="UPLOAD_FAIL",
        severity=ErrorSeverity.LOW,
        reason="Image upload failed",
        recovery="Resize and retry",
        user_hint="이미지 규격을 확인해 주세요.",
    ),
    "VALIDATION_FAIL": ErrorDescriptor(
        code="VALIDATION_FAIL",
        severity=ErrorSeverity.LOW,
        reason="Pre-validation failed",
        recovery="User correction required",
        user_hint="잘못된 값을 수정해 주세요.",
    ),
    "PARTIAL_APPLY": ErrorDescriptor(
        code="PARTIAL_APPLY",
        severity=ErrorSeverity.INFO,
        reason="Some changes failed",
        recovery="Requeue failed subset",
        user_hint="실패 항목만 재시도할 수 있습니다.",
    ),
    "SNAPSHOT_MISMATCH": ErrorDescriptor(
        code="SNAPSHOT_MISMATCH",
        severity=ErrorSeverity.LOW,
        reason="Immediate post-apply snapshot mismatch",
        recovery="Requery after delay",
        user_hint="반영까지 다소 시간이 걸릴 수 있습니다.",
    ),
}
