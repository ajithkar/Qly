"""Shared response envelope and the pagination contract used by every list."""
from __future__ import annotations

from typing import Any, Generic, List, Optional, TypeVar

from fastapi import Query
from pydantic import BaseModel, Field

T = TypeVar("T")


class PageMeta(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int


class DataResponse(BaseModel, Generic[T]):
    """Standard success envelope: {"data": ..., "meta": ...}"""

    data: T
    meta: Optional[Any] = None


class PaginatedResponse(BaseModel, Generic[T]):
    data: List[T]
    meta: PageMeta


class PaginationParams(BaseModel):
    page: int = 1
    page_size: int = 25
    sort: str = "created_at"
    order: str = "desc"
    search: Optional[str] = None

    @property
    def skip(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def sort_direction(self) -> int:
        return -1 if self.order.lower() == "desc" else 1


def pagination_params(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    sort: str = Query("created_at"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    search: Optional[str] = Query(None, max_length=200),
) -> PaginationParams:
    """FastAPI dependency giving every list endpoint the same contract."""
    return PaginationParams(
        page=page, page_size=page_size, sort=sort, order=order, search=search
    )


def paginate(items: List[Any], total: int, params: PaginationParams) -> dict:
    total_pages = (total + params.page_size - 1) // params.page_size if total else 0
    return {
        "data": items,
        "meta": PageMeta(
            page=params.page,
            page_size=params.page_size,
            total=total,
            total_pages=total_pages,
        ).model_dump(),
    }


def ok(data: Any, meta: Any = None) -> dict:
    """Wrap a payload in the standard success envelope."""
    return {"data": data, "meta": meta}


class MessageResponse(BaseModel):
    message: str = Field(..., examples=["Operation completed successfully."])
