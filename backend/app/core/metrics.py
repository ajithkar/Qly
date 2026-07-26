"""In-process request metrics backing the admin System Health card.

Deliberately simple and dependency-free. For multi-instance deployments,
export these to Prometheus rather than reading one instance's numbers.
"""
from __future__ import annotations

import time
from dataclasses import dataclass, field


@dataclass
class Metrics:
    request_count: int = 0
    error_count: int = 0
    total_latency_ms: float = 0.0
    started_at: float = field(default_factory=time.monotonic)

    def observe(self, latency_ms: float, is_error: bool) -> None:
        self.request_count += 1
        self.total_latency_ms += latency_ms
        if is_error:
            self.error_count += 1

    @property
    def average_latency_ms(self) -> float:
        if not self.request_count:
            return 0.0
        return round(self.total_latency_ms / self.request_count, 2)

    @property
    def uptime_seconds(self) -> int:
        return int(time.monotonic() - self.started_at)


metrics = Metrics()
