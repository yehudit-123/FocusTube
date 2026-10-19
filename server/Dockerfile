# Build for linux/amd64
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# --- CUSTOM CA CERTS (local development only) ---
# Put any *.crt files in server/certs/. An empty folder is fine
# (e.g. for the grader, or for anyone not behind NetFree).
COPY certs/ /usr/local/share/ca-certificates/extra/
RUN update-ca-certificates
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
# --- END CUSTOM CA CERTS ---

COPY requirements.txt .
# RUN pip install --no-cache-dir -r requirements.txt
RUN pip install --no-cache-dir \
    --trusted-host pypi.org \
    --trusted-host pypi.python.org \
    --trusted-host files.pythonhosted.org \
    -r requirements.txt

COPY . /app/server

EXPOSE 8000
 CMD ["uvicorn", "server.app.main:app", "--host", "0.0.0.0", "--port", "8000"] 