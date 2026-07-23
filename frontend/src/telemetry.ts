import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { UserInteractionInstrumentation } from '@opentelemetry/instrumentation-user-interaction';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';

const enabled = import.meta.env.VITE_OTEL_ENABLED === 'true';

if (enabled) {
  const serviceName = import.meta.env.VITE_OTEL_SERVICE_NAME || 'rudraone-frontend';
  const endpoint = import.meta.env.VITE_OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces';

  console.log(`[Telemetry] Initializing OpenTelemetry for ${serviceName} exporting to ${endpoint}`);

  const provider = new WebTracerProvider({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      'deployment.environment': import.meta.env.MODE || 'development',
    }),
  });

  const exporter = new OTLPTraceExporter({
    url: endpoint,
    headers: {},
  });

  provider.addSpanProcessor(new BatchSpanProcessor(exporter));
  provider.register();

  // Configure trace header propagation to automatically link frontend and backend spans
  // Supports localhost development, local production, and Cloudflare tunnels
  const corsUrlsToPropagate = [
    /localhost:8000/,
    /trycloudflare\.com/,
    new RegExp(window.location.host),
  ];

  registerInstrumentations({
    instrumentations: [
      new FetchInstrumentation({
        propagateTraceHeaderCorsUrls: corsUrlsToPropagate,
      }),
      new XMLHttpRequestInstrumentation({
        propagateTraceHeaderCorsUrls: corsUrlsToPropagate,
      }),
      new UserInteractionInstrumentation({
        eventNames: ['click', 'submit'],
      }),
    ],
  });

  console.log('[Telemetry] Frontend instrumentation initialized successfully.');
} else {
  console.log('[Telemetry] OpenTelemetry is disabled (VITE_OTEL_ENABLED is not true).');
}
