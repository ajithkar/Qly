.PHONY: help install dev api web test check seed up down clean

help:
	@echo "Qly — queue & appointment platform"
	@echo ""
	@echo "  make up        Run the whole stack in Docker (http://localhost:8080)"
	@echo "  make down      Stop it"
	@echo "  make install   Install backend + frontend dependencies locally"
	@echo "  make api       Run the API only (needs Mongo + Redis running)"
	@echo "  make web       Run the frontend dev server"
	@echo "  make seed      Load plans, categories, admin and demo data"
	@echo "  make test      Backend tests + frontend lint"
	@echo "  make check     Verify the frontend/backend API contract"

install:
	cd backend && pip install -r requirements-dev.txt
	cd frontend && npm install

dev: up

api:
	cd backend && uvicorn app.main:app --reload

web:
	cd frontend && npm run dev

seed:
	cd backend && python -m scripts.seed

test:
	cd backend && python -m pytest -q
	cd frontend && npm run lint

check:
	python3 scripts/check_contract.py

up:
	docker compose up --build

down:
	docker compose down

clean:
	docker compose down -v
	rm -rf frontend/node_modules frontend/dist
	find backend -name __pycache__ -type d -exec rm -rf {} + 2>/dev/null || true
