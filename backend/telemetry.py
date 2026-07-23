"""
OpenTelemetry initialization and instrumentation helper.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from opentelemetry import trace, metrics
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter as GRPCSpanExporter
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter as HTTPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter as GRPCMetricExporter
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter as HTTPMetricExporter

from backend.database import engine

logger = logging.getLogger(__name__)


def init_telemetry(app) -> None:
    """Initialize OpenTelemetry tracers, meters, loggers, and auto-instrumentations."""
    # Check if enabled
    otel_enabled = os.getenv("OTEL_ENABLED", "false").lower() == "true"
    if not otel_enabled:
        logger.info("OpenTelemetry is disabled (OTEL_ENABLED is not true).")
        return

    service_name = os.getenv("OTEL_SERVICE_NAME", "rudraone-backend")
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "")
    protocol = os.getenv("OTEL_EXPORTER_OTLP_PROTOCOL", "grpc").lower()
    access_token = os.getenv("SIGNOZ_ACCESS_TOKEN", "")

    if not endpoint:
        logger.warning("OpenTelemetry OTLP endpoint is not configured. Skipping initialization.")
        return

    logger.info(
        "Initializing OpenTelemetry for service '%s' targeting endpoint: %s (%s)",
        service_name, endpoint, protocol
    )

    # 1. Define Resource Attributes (including ingestion token if using SigNoz Cloud)
    attributes = {
        "service.name": service_name,
        "deployment.environment": os.getenv("ENVIRONMENT", "development"),
    }
    resource = Resource.create(attributes=attributes)

    # Headers for SigNoz Cloud ingestion
    headers = {}
    if access_token:
        headers["signoz-access-token"] = access_token

    # 2. Configure Tracing (Exporters and Processors)
    tracer_provider = TracerProvider(resource=resource)
    
    if protocol == "grpc":
        span_exporter = GRPCSpanExporter(endpoint=endpoint, headers=headers)
    else:
        # HTTP OTLP path defaults to endpoint/v1/traces unless already specified
        trace_endpoint = endpoint if "/v1/traces" in endpoint else f"{endpoint}/v1/traces"
        span_exporter = HTTPSpanExporter(endpoint=trace_endpoint, headers=headers)

    span_processor = BatchSpanProcessor(span_exporter)
    tracer_provider.add_span_processor(span_processor)
    trace.set_tracer_provider(tracer_provider)

    # 3. Configure Metrics (Exporters and Readers)
    if protocol == "grpc":
        metric_exporter = GRPCMetricExporter(endpoint=endpoint, headers=headers)
    else:
        metric_endpoint = endpoint if "/v1/metrics" in endpoint else f"{endpoint}/v1/metrics"
        metric_exporter = HTTPMetricExporter(endpoint=metric_endpoint, headers=headers)

    reader = PeriodicExportingMetricReader(metric_exporter)
    meter_provider = MeterProvider(resource=resource, metric_readers=[reader])
    metrics.set_meter_provider(meter_provider)

    # 4. Configure Log Correlation & Export to SigNoz OTLP
    try:
        from opentelemetry.instrumentation.logging import LoggingInstrumentor
        from opentelemetry._logs import set_logger_provider
        from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
        from opentelemetry.sdk._logs.export import BatchLogRecordProcessor

        # Set custom logging format automatically containing [otelTraceID=... otelSpanID=...]
        log_format = "%(asctime)s %(levelname)s [%(name)s] [%(filename)s:%(lineno)d] [otelTraceID=%(otelTraceID)s otelSpanID=%(otelSpanID)s] - %(message)s"
        LoggingInstrumentor().instrument(set_logging_format=True, logging_format=log_format)
        logger.info("Log correlation instrumented successfully.")

        # Choose the right log exporter based on protocol
        if protocol == "grpc":
            from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
            log_exporter = OTLPLogExporter(endpoint=endpoint, headers=headers)
        else:
            log_endpoint = endpoint if "/v1/logs" in endpoint else f"{endpoint}/v1/logs"
            from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
            log_exporter = OTLPLogExporter(endpoint=log_endpoint, headers=headers)

        logger_provider = LoggerProvider(resource=resource)
        set_logger_provider(logger_provider)
        logger_provider.add_log_record_processor(BatchLogRecordProcessor(log_exporter))

        # Attach handler to root logger
        handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
        logging.getLogger().addHandler(handler)
        logger.info("OTLP log exporter configured successfully.")
    except Exception as e:
        logger.error("Failed to configure logging and OTLP exporter: %s", e)

    # 5. Apply Auto-Instrumentation
    # FastAPI route mapping
    try:
        FastAPIInstrumentor.instrument_app(app)
        logger.info("FastAPI auto-instrumentation loaded.")
    except Exception as e:
        logger.error("Failed to instrument FastAPI: %s", e)

    # SQLAlchemy database queries
    try:
        SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)
        logger.info("SQLAlchemy database calls instrumented successfully.")
    except Exception as e:
        logger.error("Failed to instrument SQLAlchemy: %s", e)

    # AsyncPG database driver queries
    try:
        from opentelemetry.instrumentation.asyncpg import AsyncPGInstrumentor
        AsyncPGInstrumentor().instrument()
        logger.info("AsyncPG database driver instrumented successfully.")
    except Exception as e:
        logger.error("Failed to instrument AsyncPG: %s", e)

    # Outgoing HTTP Client (HTTPX)
    try:
        HTTPXClientInstrumentor().instrument()
        logger.info("HTTPX client calls instrumented successfully.")
    except Exception as e:
        logger.error("Failed to instrument HTTPX client: %s", e)
