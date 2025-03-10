# Dockerfile for the data generator container
FROM python:3.9-slim

WORKDIR /app

# Install required packages
RUN pip install kafka-python

# Keep container running
CMD ["tail", "-f", "/dev/null"]
