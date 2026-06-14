FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast package management
RUN pip install uv

# Copy all agent files from repo root context
COPY apps/agent/ ./

# Install all dependencies from pyproject.toml directly (not editable)
RUN uv pip install --system --no-cache-dir \
    "langgraph>=0.2.0" \
    "langchain-google-genai>=2.0.0" \
    "langchain-anthropic>=0.3.0" \
    "langchain-core>=0.3.0" \
    "copilotkit>=0.1.0" \
    "mcp-use>=1.7.0" \
    "python-dotenv>=1.0.0" \
    "jsonpatch>=1.33" \
    "typing-extensions>=4.10.0" \
    "langgraph-cli[inmem]>=0.2.0" \
    "psycopg[binary]>=3.2.0" \
    "deepagents>=0.0.1" || \
    uv pip install --system --no-cache-dir \
    "langgraph>=0.2.0" \
    "langchain-google-genai>=2.0.0" \
    "langchain-core>=0.3.0" \
    "copilotkit>=0.1.0" \
    "python-dotenv>=1.0.0" \
    "jsonpatch>=1.33" \
    "typing-extensions>=4.10.0" \
    "langgraph-cli[inmem]>=0.2.0" \
    "psycopg[binary]>=3.2.0"

# Expose the langgraph dev server port
EXPOSE 8133

# Start the open-source langgraph dev server (no license required)
CMD ["langgraph", "dev", "--host", "0.0.0.0", "--port", "8133", "--no-browser"]
