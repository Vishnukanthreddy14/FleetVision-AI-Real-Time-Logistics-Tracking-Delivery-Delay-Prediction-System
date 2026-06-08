"""
FleetVisionAI: Apache Kafka Telemetry Consumer
Consumes streaming logistics events from Kafka topics:
  • vehicle-tracking
  • delivery-alerts
  • eta-predictions
and routes them into MongoDB and WebSocket clients.
"""

import os
import json
import logging
import threading
from typing import Dict, Any, Callable, Optional

logger = logging.getLogger("fleetvision.kafka.consumer")

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
TOPIC_VEHICLE_TRACKING = "vehicle-tracking"
TOPIC_DELIVERY_ALERTS = "delivery-alerts"
TOPIC_ETA_PREDICTIONS = "eta-predictions"

class FleetKafkaConsumer:
    def __init__(self, bootstrap_servers: str = KAFKA_BOOTSTRAP_SERVERS, group_id: str = "fleetvision-backend-group"):
        self.bootstrap_servers = bootstrap_servers
        self.group_id = group_id
        self.consumer = None
        self.is_running = False
        self._thread: Optional[threading.Thread] = None

    def start_listening(self, callback: Optional[Callable[[str, Dict[str, Any]], None]] = None):
        """Starts asynchronous background consumption loop."""
        try:
            from kafka import KafkaConsumer
            self.consumer = KafkaConsumer(
                TOPIC_VEHICLE_TRACKING,
                TOPIC_DELIVERY_ALERTS,
                TOPIC_ETA_PREDICTIONS,
                bootstrap_servers=self.bootstrap_servers,
                group_id=self.group_id,
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
                auto_offset_reset="latest",
                enable_auto_commit=True,
                consumer_timeout_ms=1000
            )
            self.is_running = True
            self._thread = threading.Thread(target=self._consume_loop, args=(callback,), daemon=True)
            self._thread.start()
            logger.info("Kafka consumer subscribed to topics on %s", self.bootstrap_servers)
        except Exception as e:
            logger.warning("Kafka Consumer could not connect to %s (%s). Operating in direct WebSocket mode.", self.bootstrap_servers, e)

    def _consume_loop(self, callback: Optional[Callable[[str, Dict[str, Any]], None]]):
        while self.is_running and self.consumer:
            try:
                for message in self.consumer:
                    topic = message.topic
                    payload = message.value
                    if callback:
                        callback(topic, payload)
            except Exception as e:
                logger.debug("Kafka consume iteration exception: %s", e)

    def stop(self):
        self.is_running = False
        if self.consumer:
            try:
                self.consumer.close()
            except Exception:
                pass

# Singleton consumer instance
kafka_consumer = FleetKafkaConsumer()
