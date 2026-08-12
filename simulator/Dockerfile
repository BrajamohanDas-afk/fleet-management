FROM python:3.12-slim

WORKDIR /app

# Install ffmpeg for H.264 RTSP publishing and OpenCV runtime libraries.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libglib2.0-0 \
    libgomp1 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast Python package management.
RUN pip install --no-cache-dir uv

# Copy dependency definition first to leverage Docker layer caching.
COPY pyproject.toml .
RUN uv pip install --system -r pyproject.toml

# Copy simulator code.
COPY . .

# Default entry point: run the supervisor.
CMD ["python", "supervisor.py", "--config", "config.yaml"]
