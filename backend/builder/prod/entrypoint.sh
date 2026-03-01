#!/bin/bash
set -e

# Menunggu database (Sangat penting di lingkungan cloud/VPS)
until nc -z db 5432; do
  echo "Menunggu Database Produksi..."
  sleep 2
done

echo "Database Produksi Terkoneksi!"

# Di Prod, sangat disarankan menjalankan migrasi otomatis
# python -m alembic upgrade head

# Menjalankan aplikasi
exec "$@"