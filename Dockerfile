# =============================================================================
# FleetVision AI — Multi-Stage Production Container
# Real-Time Logistics Tracking, ML Delay Prediction & 3D Telematics Portal
# =============================================================================
FROM python:3.11-slim

# Set environment defaults
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    HOST=0.0.0.0 \
    MONGO_URI=mongodb://mongodb:27017 \
    DATABASE_NAME=fleetvision_ai

# Set work directory
WORKDIR /app

# Install system dependencies for compilation, health checks, and geospatial tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency specifications first for Docker layer caching
COPY requirements.txt .

# Install Python packages
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY data/ ./data/
COPY ml/ ./ml/
COPY run.py .
COPY .env.example .env

# Expose application port
EXPOSE 8000

# Container healthcheck
HEALTHCHECK --interval=20s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Launch application
CMD ["python", "run.py"]
