"""Sales leads captured from the public marketing site. Not tenant data -
nobody has signed up yet when one of these is created."""
from __future__ import annotations

from app.repositories.base import BaseRepository


class LeadRepository(BaseRepository):
    collection_name = "leads"
    tenant_scoped = False
    soft_delete = False
    searchable_fields = ("name", "organisation", "email")
