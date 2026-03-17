# --- STAGE 1: Build ---
    FROM python:3.10-slim AS builder

    # Environment variables untuk optimasi Python
    ENV PYTHONDONTWRITEBYTECODE=1 \
        PYTHONUNBUFFERED=1
    
    COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
    
    WORKDIR /app
    COPY requirements.txt .
    
    # Install dependencies
    RUN uv pip install --system --no-cache -r requirements.txt
    
    
    # --- STAGE 2: Final ---
    FROM python:3.10-slim
    
    # Set environment variables
    ENV PYTHONDONTWRITEBYTECODE=1 \
        PYTHONUNBUFFERED=1 \
        PATH="/home/appuser/.local/bin:$PATH"
    
    WORKDIR /app
    
    # 1. Install system dependencies (OpenCV & Tools)
    RUN apt-get update && apt-get install -y \
        netcat-openbsd \
        libgl1 \
        libglib2.0-0 \
        && rm -rf /var/lib/apt/lists/*
    
    # 2. Setup User Non-Root sejak awal
    RUN adduser --disabled-password --gecos '' appuser
    
    # 3. Copy dependencies dari stage builder
    COPY --from=builder /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
    COPY --from=builder /usr/local/bin /usr/local/bin
    
    # 4. Copy entrypoint (LAKUKAN SEBAGAI ROOT SEBELUM PINDAH USER)
    # Gunakan flag --chmod jika docker versimu mendukung (Docker 20.10+)
    COPY --chmod=755 ./builder/prod/entrypoint.sh /entrypoint.sh
    # Jika tidak yakin versinya, gunakan:
    # COPY ./builder/prod/entrypoint.sh /entrypoint.sh
    # RUN chmod +x /entrypoint.sh
    
    # 5. Copy source code dengan kepemilikan user langsung
    # Ini jauh lebih efisien daripada RUN chown -R
    COPY --chown=appuser:appuser . .
    
    # 6. Pastikan appuser memiliki hak akses ke /app
    RUN chown appuser:appuser /app
    
    # 7. BARU PINDAH KE USER NON-ROOT
    USER appuser
    
    ENTRYPOINT ["/entrypoint.sh"]
    
    # Jalankan dengan uvicorn
    CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4", "--proxy-headers", "--forwarded-allow-ips", "*"]