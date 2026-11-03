FROM python:3.11-slim

WORKDIR /app

# Install ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application files
COPY . .

# Hugging Face Spaces default port
ENV PORT=7860
EXPOSE 7860

CMD ["python", "app.py"]
