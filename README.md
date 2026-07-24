# RudraOne — AI Voice Emergency Dispatcher with Deep SigNoz Observability

RudraOne is a real-time, low-latency voice emergency dispatcher AI agent. It is designed to handle critical 911 calls, parse incident reports, geolocate emergencies, and dispatch nearby agencies. To guarantee the millisecond-level reliability required in life-or-death scenarios, the entire application is deeply instrumented with **OpenTelemetry (OTel)**, exporting metrics, distributed traces, and correlated logs to **SigNoz**.

---

## 📺 Project Demo

![RudraOne Emergency Dispatcher Demo](https://raw.githubusercontent.com/SigNoz/signoz/main/deploy/common/images/signoz-logo.png)
*(A video walkthrough demonstrating real-time voice calls, live dispatch mapping, and correlated trace diagnostics inside SigNoz will be attached here)*

---

## 🚨 Problem Statement

Emergency response voice agents are highly latency-critical. A human in crisis cannot wait for a lagging AI. 
RudraOne runs a complex, asynchronous pipeline:
1. **Real-time Audio Streaming**: Browser WebSockets stream audio to the backend.
2. **Live Transcription**: Backend streams chunked audio to Deepgram (STT).
3. **LLM Reasoning**: FastAPI backend prompts an OpenAI-compatible LLM (e.g. OpenAI, DeepSeek, or Vultr) to classify the call, extract location context, and formulate a response.
4. **Speech Synthesis**: LLM response is converted to audio via ElevenLabs (TTS).
5. **Database Transaction**: Call transcripts, locations, and dispatch details are saved asynchronously to PostgreSQL.

If a call stutters or has a delay, a standard APM setup cannot isolate the bottleneck. We must know instantly: Is it the network socket? Deepgram transcription lag? The LLM response generation? ElevenLabs speech synthesis? Or a slow SQL write to PostgreSQL?

---

## 💡 The Solution: Why SigNoz?

To solve these latency and reliability challenges, we chose **SigNoz** as our unified observability platform. 

### Why SigNoz Was the Best Choice:
1. **Open-Source & Easy to Deploy**: Unlike proprietary APM vendors (Datadog, New Relic) that require complex onboarding, closed agents, and licensing agreements, SigNoz is fully open-source. Using **SigNoz Foundry (`foundryctl`)**, we can stand up the entire SigNoz stack (ClickHouse database, OpenTelemetry Collector, Query-Service, and Frontend) locally in seconds using a single declarative configuration file (`casting.yaml`).
2. **AI-Native Observability**: Custom telemetry tags enable monitoring of modern AI-native applications. By tracing LLM prompts, completion usage, token metrics, and active model attributes, SigNoz exposes full transparency over the inner workings of our AI pipeline.
3. **Deep APM & Custom AI Spans**: SigNoz native support for custom OpenTelemetry spans allows us to trace LLM completions, TTS audio generation, and browser user clicks in a single end-to-end distributed trace.
4. **Log-to-Trace Correlation**: By embedding active trace IDs directly into our backend logger, SigNoz maps logs to their originating spans. When a call fails, we can click the error log in the SigNoz Logs Explorer and instantly jump to the exact span flamegraph to inspect the database query or API payload.
5. **No Vendor Lock-In**: Built entirely on OpenTelemetry standards. If we scale up, we can repoint our telemetry exporter endpoint without changing a single line of application code.

---

## 🛠️ Observability Features Used

### 1. Distributed Tracing & Service Map
* **React Frontend**: Auto-instruments browser HTTP requests and user clicks, propagating W3C context headers (`traceparent`) to the backend.
* **FastAPI Backend**: Reads context headers to correlate browser actions with server-side routes, automatically generating a unified trace flamegraph and constructing the **SigNoz Service Map**.
* **PostgreSQL Database**: Auto-instruments every ORM engine event and raw driver operation (`asyncpg`), exposing slow queries directly in trace timelines.

### 2. Custom APM & AI Token Usage Dashboard
We built a custom V5 dashboard to monitor the entire dispatch pipeline:
* **KPI Metrics**: Total request count, error count, and average backend execution latency (ms).
* **Token Tracking**: Value and line charts tracking **Prompt**, **Completion**, and **Total LLM tokens consumed** over time.
* **Response Latency**: Real-time graph tracking request duration per minute.
* **Top Endpoints Table**: Displays the most active FastAPI routes, their average latencies, and error rates.

### 3. Log Explorer & Logs Query Builder
Backend logging is formatted to inject OTel context tags: `[otelTraceID=... otelSpanID=...]`. Using the Logs Query Builder, we can filter by `serviceName = 'rudraone-backend'`, query by log level, and inspect correlated request histories.

### 4. Exception Analysis
Any unhandled exceptions, database transaction conflicts, or API quotas (e.g. ElevenLabs quota limit or Twilio API timeouts) are captured as span events and reported in the SigNoz **Exceptions** tab with full Python stack traces.

---

## 🚀 Getting Started & Setup

### Prerequisites
* **Docker & Docker Compose**
* **foundryctl** (SigNoz Foundry CLI)

---

### 1. Environment Setup
Create a `.env` file in the root directory from the template:
```bash
cp .env.example .env
```
Open `.env` and fill in your credentials:
* **LLM Config**: Set `LLM_API_KEY`, `LLM_BASE_URL` (e.g. OpenAI or Vultr), and `LLM_MODEL`.
* **Twilio (Optional)**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` for voice call/SMS routing.
* **Speech APIs**: `DEEPGRAM_API_KEY` (STT) and `ELEVENLABS_API_KEY` (TTS).
* **Mapbox**: `VITE_MAPBOX_TOKEN` to render map graphics in the React frontend.

---

### 2. Quick Start: Launch the Stack
You can boot both SigNoz and RudraOne concurrently:

* **For Windows (PowerShell)**:
  ```powershell
  foundryctl cast -f casting.yaml; docker compose up -d --build
  ```
* **For Linux / macOS (Bash)**:
  ```bash
  foundryctl cast -f casting.yaml && docker compose up -d --build
  ```

---

### 3. Automated Seeding (Zero-Configuration Deployment)
To make our deployment 100% reproducible for judges and developers, our backend application is programmed with an **automatic database seeder** (`backend/signoz_seeder.py`).

Upon running `docker compose up`, the backend lifecycle startup hooks will automatically connect to the SigNoz Postgres metastore and:
1. Create a service account named `agent`.
2. Bind the `agent` service account to the `signoz-admin` role.
3. Seed the `4mrgKQQF31otQfn80EP49e3I2DCKRP/HgHy9/+T5aZs=` API key (used by the SigNoz MCP Server).
4. Auto-import the **"RudraOne AI Agent & APM Monitor"** dashboard.

Once the containers are healthy, you can access the pre-configured dashboard immediately:
👉 **APM Dashboard URL**: [http://localhost:8080/dashboard/019f5a94-8617-7b7d-bc8c-e19f1ee892d0](http://localhost:8080/dashboard/019f5a94-8617-7b7d-bc8c-e19f1ee892d0)

---

## 🔗 Endpoint Reference

| Service | URL | Description |
| :--- | :--- | :--- |
| 🖥️ **RudraOne Frontend** | `http://localhost:8082` | React dispatcher dashboard and tracking maps. |
| ⚙️ **RudraOne Backend API** | `http://localhost:8000` | FastAPI root endpoint. |
| 📖 **API Interactive Docs** | `http://localhost:8000/docs` | Swagger API testing UI. |
| 📊 **SigNoz Observability UI** | `http://localhost:8080` | Unified observability dashboard. |

---

## 🗃️ Custom Dashboard JSON Template

If you need to import the dashboard configuration manually to a different SigNoz environment:
1. Navigate to **Dashboards** in the SigNoz UI.
2. Click **+ New Dashboard** -> **Import JSON**.
3. Copy and paste the JSON schema below:

```json
{
  "title": "RudraOne AI Agent & APM Monitor",
  "name": "RudraOne AI Agent & APM Monitor",
  "description": "Comprehensive APM monitoring for the RudraOne emergency dispatch AI backend — request rates, latency percentiles, endpoint breakdown, DB queries, error tracking, and LLM token usage.",
  "tags": ["rudraone", "apm", "ai-agent"],
  "uploadedGrafana": false,
  "version": "v5",
  "variables": {},
  "panelMap": {},
  "layout": [
    {"i": "panel-request-rate", "x": 0, "y": 0, "w": 3, "h": 2},
    {"i": "panel-error-count", "x": 3, "y": 0, "w": 3, "h": 2},
    {"i": "panel-avg-latency", "x": 6, "y": 0, "w": 3, "h": 2},
    {"i": "panel-total-tokens-value", "x": 9, "y": 0, "w": 3, "h": 2},
    {"i": "panel-latency-ts", "x": 0, "y": 2, "w": 6, "h": 5},
    {"i": "panel-request-ts", "x": 6, "y": 2, "w": 6, "h": 5},
    {"i": "panel-token-usage", "x": 0, "y": 7, "w": 12, "h": 5},
    {"i": "panel-top-endpoints", "x": 0, "y": 12, "w": 12, "h": 5}
  ],
  "widgets": [
    {
      "id": "panel-request-rate",
      "title": "Total Request Count",
      "description": "Total number of trace spans in the selected time range",
      "panelTypes": "value",
      "query": {
        "queryType": "clickhouse_sql",
        "clickhouse_sql": [
          {
            "name": "A",
            "query": "SELECT toFloat64(count()) as value FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName = 'rudraone-backend' AND timestamp >= $start_datetime AND timestamp <= $end_datetime",
            "legend": "Requests",
            "disabled": false
          }
        ]
      }
    },
    {
      "id": "panel-error-count",
      "title": "Error Count",
      "description": "Total number of spans with errors",
      "panelTypes": "value",
      "query": {
        "queryType": "clickhouse_sql",
        "clickhouse_sql": [
          {
            "name": "A",
            "query": "SELECT toFloat64(countIf(has_error = true)) as value FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName = 'rudraone-backend' AND timestamp >= $start_datetime AND timestamp <= $end_datetime",
            "legend": "Errors",
            "disabled": false
          }
        ]
      }
    },
    {
      "id": "panel-avg-latency",
      "title": "Avg Latency (ms)",
      "description": "Average span duration across all endpoints",
      "panelTypes": "value",
      "query": {
        "queryType": "clickhouse_sql",
        "clickhouse_sql": [
          {
            "name": "A",
            "query": "SELECT avg(durationNano) / 1000000 as value FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName = 'rudraone-backend' AND timestamp >= $start_datetime AND timestamp <= $end_datetime",
            "legend": "Latency (ms)",
            "disabled": false
          }
        ]
      }
    },
    {
      "id": "panel-total-tokens-value",
      "title": "Total Tokens Consumed",
      "description": "Total LLM tokens consumed in the selected time range",
      "panelTypes": "value",
      "query": {
        "queryType": "clickhouse_sql",
        "clickhouse_sql": [
          {
            "name": "A",
            "query": "SELECT toFloat64(sum(attributes_number['llm.usage.total_tokens'])) as value FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName = 'rudraone-backend' AND mapContains(attributes_number, 'llm.usage.total_tokens') AND timestamp >= $start_datetime AND timestamp <= $end_datetime",
            "legend": "Total Tokens",
            "disabled": false
          }
        ]
      }
    },
    {
      "id": "panel-latency-ts",
      "title": "Latency Over Time (Avg ms)",
      "description": "Average latency per minute",
      "panelTypes": "graph",
      "query": {
        "queryType": "clickhouse_sql",
        "clickhouse_sql": [
          {
            "name": "A",
            "query": "SELECT toStartOfInterval(timestamp, INTERVAL 1 MINUTE) as time, avg(durationNano) / 1000000 as value FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName = 'rudraone-backend' AND timestamp >= $start_datetime AND timestamp <= $end_datetime GROUP BY time ORDER BY time ASC",
            "legend": "Avg Latency (ms)",
            "disabled": false
          }
        ]
      }
    },
    {
      "id": "panel-request-ts",
      "title": "Request Count Over Time",
      "description": "Number of requests per minute",
      "panelTypes": "graph",
      "query": {
        "queryType": "clickhouse_sql",
        "clickhouse_sql": [
          {
            "name": "A",
            "query": "SELECT toStartOfInterval(timestamp, INTERVAL 1 MINUTE) as time, toFloat64(count()) as value FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName = 'rudraone-backend' AND timestamp >= $start_datetime AND timestamp <= $end_datetime GROUP BY time ORDER BY time ASC",
            "legend": "Requests/min",
            "disabled": false
          }
        ]
      }
    },
    {
      "id": "panel-token-usage",
      "title": "AI Token Usage Over Time",
      "description": "Prompt, Completion, and Total tokens consumed by the AI Agent over time",
      "panelTypes": "graph",
      "query": {
        "queryType": "clickhouse_sql",
        "clickhouse_sql": [
          {
            "name": "A",
            "query": "SELECT toStartOfInterval(timestamp, INTERVAL 1 MINUTE) as time, sum(attributes_number['llm.usage.prompt_tokens']) as value FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName = 'rudraone-backend' AND mapContains(attributes_number, 'llm.usage.prompt_tokens') AND timestamp >= $start_datetime AND timestamp <= $end_datetime GROUP BY time ORDER BY time ASC",
            "legend": "Prompt Tokens",
            "disabled": false
          },
          {
            "name": "B",
            "query": "SELECT toStartOfInterval(timestamp, INTERVAL 1 MINUTE) as time, sum(attributes_number['llm.usage.completion_tokens']) as value FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName = 'rudraone-backend' AND mapContains(attributes_number, 'llm.usage.completion_tokens') AND timestamp >= $start_datetime AND timestamp <= $end_datetime GROUP BY time ORDER BY time ASC",
            "legend": "Completion Tokens",
            "disabled": false
          },
          {
            "name": "C",
            "query": "SELECT toStartOfInterval(timestamp, INTERVAL 1 MINUTE) as time, sum(attributes_number['llm.usage.total_tokens']) as value FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName = 'rudraone-backend' AND mapContains(attributes_number, 'llm.usage.total_tokens') AND timestamp >= $start_datetime AND timestamp <= $end_datetime GROUP BY time ORDER BY time ASC",
            "legend": "Total Tokens",
            "disabled": false
          }
        ]
      }
    },
    {
      "id": "panel-top-endpoints",
      "title": "Top Endpoints by Request Count",
      "description": "Most-called API endpoints with average latency and error count",
      "panelTypes": "table",
      "query": {
        "queryType": "clickhouse_sql",
        "clickhouse_sql": [
          {
            "name": "A",
            "query": "SELECT httpRoute as endpoint, httpMethod as method, toFloat64(count()) as calls, avg(durationNano) / 1000000 as avg_latency_ms, toFloat64(countIf(has_error = true)) as errors FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName = 'rudraone-backend' AND httpRoute != '' AND timestamp >= $start_datetime AND timestamp <= $end_datetime GROUP BY httpRoute, httpMethod ORDER BY calls DESC LIMIT 20",
            "legend": "Endpoints",
            "disabled": false
          }
        ]
      }
    }
  ]
}
```
