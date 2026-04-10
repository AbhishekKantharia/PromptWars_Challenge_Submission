FROM python:3.9-slim

WORKDIR /app

COPY . .

# Cloud Run sets the PORT environment variable
ENV PORT=8080

CMD ["python", "app.py"]
