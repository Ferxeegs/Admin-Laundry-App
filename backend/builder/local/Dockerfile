# Menggunakan base image python slim yang stabil
FROM python:3.10-slim

# 1. Install uv (Package manager tercepat saat ini)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# 2. Install system dependencies (netcat untuk cek DB, lib untuk OpenCV)
RUN apt-get update && apt-get install -y \
    netcat-openbsd \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 3. Install dependencies terlebih dahulu (agar ter-cache oleh Docker)
COPY requirements.txt .
RUN uv pip install --system --no-cache -r requirements.txt

# 4. Copy entrypoint
COPY ./builder/local/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Entrypoint menangani pengecekan DB
ENTRYPOINT ["/entrypoint.sh"]

# Default command untuk development (bisa di-override di docker-compose)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]