FROM node:22-bookworm-slim AS web
WORKDIR /build/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 EVIDENCELAB_HOME=/data/lab EVIDENCELAB_ROOT=/app
WORKDIR /app
COPY pyproject.toml uv.lock README.md LICENSE ./
COPY src/ ./src/
COPY data/demo/ ./data/demo/
COPY notebooks/ ./notebooks/
COPY docs/experiments/ ./docs/experiments/
COPY --from=web /build/web/dist ./web/dist/
RUN pip install --no-cache-dir uv==0.13.7 && uv sync --locked --no-dev --no-editable --python /usr/local/bin/python && useradd --uid 10001 --create-home lab && mkdir -p /data/lab && chown -R lab:lab /data
ENV PATH="/app/.venv/bin:$PATH"
USER lab
EXPOSE 8000
CMD ["uvicorn", "evidencelab.api:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]
