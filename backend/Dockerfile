FROM python:3.12-slim

WORKDIR /app

# Install system dependencies: ffmpeg for server-side clip recording.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast Python package management.
RUN pip install --no-cache-dir uv

# Copy dependency definition first to leverage Docker layer caching.
COPY pyproject.toml .
RUN uv pip install --system -r pyproject.toml

# Copy application code.
COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
