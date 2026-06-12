FROM python:3.11-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app/ML
ENV PORT=8080

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    python3-dev \
  && rm -rf /var/lib/apt/lists/*

COPY ML/requirements.txt ML/install_lightfm.py ./ML/
RUN pip install --no-cache-dir --upgrade "pip<26" "setuptools<70" wheel \
  && pip install --no-cache-dir -r ML/requirements.txt \
  && python ML/install_lightfm.py

COPY ML ./ML
RUN python -c "import importlib; [importlib.import_module(name) for name in ('numpy', 'pandas', 'scipy', 'pulp', 'xgboost', 'lightfm', 'sqlalchemy', 'pg8000', 'fastapi', 'uvicorn', 'ecobi_recommender.service')]"

EXPOSE 8080

CMD ["python", "-m", "uvicorn", "ecobi_recommender.service:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
