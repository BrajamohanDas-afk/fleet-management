.PHONY: up down migrate seed test test-e2e e2e lint logs

up:
	docker compose up -d --build

down:
	docker compose down

migrate:
	docker compose run --rm api alembic upgrade head

seed:
	docker compose run --rm api python -m app.seed

test:
	docker compose run --rm api python -m pytest tests/ -v

test-e2e:
	cd frontend && npx playwright test

e2e: test-e2e

lint:
	cd backend && python -m compileall app tests
	cd frontend && npm run lint

logs:
	docker compose logs -f
