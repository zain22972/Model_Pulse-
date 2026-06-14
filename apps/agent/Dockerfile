FROM langchain/langgraph-api:3.11

# -- Copy the agent package from the monorepo root context --
ADD apps/agent /deps/agent

# -- Install all local dependencies --
RUN for dep in /deps/*; do \
        echo "Installing $dep"; \
        if [ -d "$dep" ]; then \
            echo "Installing $dep"; \
            (cd "$dep" && PYTHONDONTWRITEBYTECODE=1 uv pip install --system --no-cache-dir -c /api/constraints.txt -e .); \
        fi; \
    done

# -- Set graph entrypoints --
ENV LANGSERVE_GRAPHS='{"default": "/deps/agent/main.py:graph", "incident": "/deps/agent/main_incident.py:graph"}'

# -- Ensure user deps didn't inadvertently overwrite langgraph-api --
RUN mkdir -p /api/langgraph_api /api/langgraph_runtime /api/langgraph_license && \
    touch /api/langgraph_api/__init__.py /api/langgraph_runtime/__init__.py /api/langgraph_license/__init__.py
RUN PYTHONDONTWRITEBYTECODE=1 uv pip install --system --no-cache-dir --no-deps -e /api
