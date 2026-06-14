FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast package management
RUN pip install uv

# Copy agent package files from repo root context
COPY apps/agent/pyproject.toml ./pyproject.toml
COPY apps/agent/langgraph.json ./langgraph.json

# Install dependencies (including langgraph-cli[inmem])
RUN uv pip install --system --no-cache-dir -e ".[dev]" 2>/dev/null || \
    uv pip install --system --no-cache-dir -e .

# Copy agent source files
COPY apps/agent/src/ ./src/
COPY apps/agent/main.py ./main.py
COPY apps/agent/main_incident.py ./main_incident.py

# Expose the langgraph dev server port
EXPOSE 8133

# Start the open-source langgraph dev server (no license required)
# --host 0.0.0.0 makes it accessible externally
CMD ["langgraph", "dev", "--host", "0.0.0.0", "--port", "8133", "--no-browser"]
