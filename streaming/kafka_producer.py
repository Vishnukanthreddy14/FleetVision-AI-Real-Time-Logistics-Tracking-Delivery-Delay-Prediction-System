"""
FleetVisionAI: Apache Kafka Telemetry Producer
Publishes high-throughput GPS telemetry, incident alerts, and ML ETA forecasts
into distributed Kafka topics:
  • vehicle-tracking
  • delivery-alerts
  • eta-predictions
"""

import os
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("fleetvision.kafka.producer")

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
TOPIC_VEHICLE_TRACKING = "vehicle-tracking"
TOPIC_DELIVERY_ALERTS = "delivery-alerts"
TOPIC_ETA_PREDICTIONS = "eta-predictions"

class FleetKafkaProducer:
    def __init__(self, bootstrap_servers: str = KAFKA_BOOTSTRAP_SERVERS):
        self.bootstrap_servers = bootstrap_servers
        self.producer = None
        self.is_connected = False
        self._init_producer()

    def _init_producer(self):
        try:
            from kafka import KafkaProducer
            self.producer = KafkaProducer(
                bootstrap_servers=self.bootstrap_servers,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                key_serializer=lambda k: str(k).encode("utf-8") if k else None,
                retries=3,
                request_timeout_ms=5000,
                max_block_ms=3000
            )
            self.is_connected = True
            logger.info("Connected to Apache Kafka broker at %s", self.bootstrap_servers)
        except Exception as e:
            self.is_connected = False
            logger.warning("Kafka broker not detected at %s (%s). Using resilient async pass-through mode.", self.bootstrap_servers, e)

    def publish_telemetry(self, vehicle_data: Dict[str, Any]) -> bool:
        """Publishes vehicle location, speed, fuel, and trip metrics."""
        if not self.is_connected or not self.producer:
            return False
        try:
            vehicle_id = vehicle_data.get("vehicle_id", "UNKNOWN")
            self.producer.send(TOPIC_VEHICLE_TRACKING, key=vehicle_id, value=vehicle_data)
            return True
        except Exception as e:
            logger.debug("Kafka send error on %s: %s", TOPIC_VEHICLE_TRACKING, e)
            return False

    def publish_alert(self, alert_data: Dict[str, Any]) -> bool:
        """Publishes dynamic disruption alerts (traffic, storm, breakdown)."""
        if not self.is_connected or not self.producer:
            return False
        try:
            vehicle_id = alert_data.get("vehicle_id", "UNKNOWN")
            self.producer.send(TOPIC_DELIVERY_ALERTS, key=vehicle_id, value=alert_data)
            return True
        except Exception as e:
            logger.debug("Kafka send error on %s: %s", TOPIC_DELIVERY_ALERTS, e)
            return False

    def publish_eta_prediction(self, prediction_data: Dict[str, Any]) -> bool:
        """Publishes multi-model ETA and delay predictions."""
        if not self.is_connected or not self.producer:
            return False
        try:
            vehicle_id = prediction_data.get("vehicle_id", "UNKNOWN")
            self.producer.send(TOPIC_ETA_PREDICTIONS, key=vehicle_id, value=prediction_data)
            return True
        except Exception as e:
            logger.debug("Kafka send error on %s: %s", TOPIC_ETA_PREDICTIONS, e)
            return False

    def flush(self):
        if self.is_connected and self.producer:
            try:
                self.producer.flush(timeout=2)
            except Exception:
                pass

# Singleton producer instance
kafka_producer = FleetKafkaProducer()
