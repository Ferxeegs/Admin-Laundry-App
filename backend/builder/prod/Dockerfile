# --- STAGE 1: Build ---
    FROM python:3.10-slim AS builder

    COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
    
    WORKDIR /app
    COPY requirements.txt .
    
    # Install dependencies ke folder khusus agar bisa disalin ke stage final
    RUN uv pip install --system --no-cache -r requirements.txt
    
    # --- STAGE 2: Final ---
    FROM python:3.10-slim
    
    WORKDIR /app
    
    # Copy dependencies dari stage builder
    COPY --from=builder /usr/local/lib/python3.10/site-packages /usr/local/lib/python3.10/site-packages
    COPY --from=builder /usr/local/bin /usr/local/bin
    
    # Install minimal library untuk OpenCV/Face Recognition
    RUN apt-get update && apt-get install -y \
        netcat-openbsd \
        libgl1 \
        libglib2.0-0 \
        && rm -rf /var/lib/apt/lists/*
    
    # Copy source code (Di prod, kode "dipanggang" dalam image)
    COPY . .
    
    # Setup User Non-Root (Standar Keamanan Tinggi)
    RUN adduser --disabled-password --gecos '' appuser
    RUN chown -R appuser:appuser /app
    USER appuser
    
    COPY ./builder/prod/entrypoint.sh /entrypoint.sh
    # Note: chown dilakukan di atas, chmod manual jika perlu lewat root sebelum USER
    # Namun biasanya chown cukup jika file disalin saat masih root
    RUN chmod +x /entrypoint.sh
    
    ENTRYPOINT ["/entrypoint.sh"]
    
    # Jalankan dengan uvicorn (Worker bisa ditambah untuk performa)
    CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "4"]