"""
FleetVisionAI: Streaming Telemetry Module (Kafka Producer & Consumer)
"""
from streaming.kafka_producer import kafka_producer, TOPIC_VEHICLE_TRACKING, TOPIC_DELIVERY_ALERTS, TOPIC_ETA_PREDICTIONS
from streaming.kafka_consumer import kafka_consumer
