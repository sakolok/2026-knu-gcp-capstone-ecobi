FROM node:22-slim

WORKDIR /app

ENV PYTHONUNBUFFERED=1
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"
ENV ML_PYTHON_PATH=/opt/venv/bin/python

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    python3 \
    python3-dev \
    python3-pip \
    python3-venv \
  && rm -rf /var/lib/apt/lists/*

COPY ML/requirements.txt ML/install_lightfm.py ./ML/
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir --upgrade "pip<26" "setuptools<70" wheel \
  && /opt/venv/bin/pip install --no-cache-dir -r ML/requirements.txt \
  && /opt/venv/bin/python ML/install_lightfm.py

COPY package*.json ./
RUN npm ci

COPY . .
RUN PYTHONPATH=ML /opt/venv/bin/python -c "import importlib; [importlib.import_module(name) for name in ('numpy', 'pandas', 'scipy', 'pulp', 'xgboost', 'lightfm', 'sqlalchemy', 'pg8000', 'ecobi_recommender.pipeline')]"
RUN npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV RECOMMENDATION_ADAPTER=ml
ENV ML_RECOMMENDER_TIMEOUT_MS=60000
ENV ML_RECOMMENDER_SKIP_MODELS=false

EXPOSE 8080

CMD ["npm", "run", "start:api"]
