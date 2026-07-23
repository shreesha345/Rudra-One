"""
Helper module to automatically seed the SigNoz postgres metastore database with the
required Service Account, API Key, and APM Dashboard on backend startup.
"""
import json
import logging
import asyncpg

logger = logging.getLogger(__name__)

SIGNOZ_METASTORE_URL = "postgresql://signoz:signoz@signoz-metastore-postgres-0:5432/signoz"

DASHBOARD_DATA = {
  "title": "RudraOne AI Agent & APM Monitor",
  "name": "RudraOne AI Agent & APM Monitor",
  "description": "Comprehensive APM monitoring for the RudraOne emergency dispatch AI backend — request rates, latency percentiles, endpoint breakdown, DB queries, error tracking, and LLM token usage.",
  "tags": ["rudraone", "apm", "ai-agent"],
  "uploadedGrafana": False,
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
            "disabled": False
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
            "disabled": False
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
            "disabled": False
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
            "disabled": False
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
            "disabled": False
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
            "disabled": False
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
            "disabled": False
          },
          {
            "name": "B",
            "query": "SELECT toStartOfInterval(timestamp, INTERVAL 1 MINUTE) as time, sum(attributes_number['llm.usage.completion_tokens']) as value FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName = 'rudraone-backend' AND mapContains(attributes_number, 'llm.usage.completion_tokens') AND timestamp >= $start_datetime AND timestamp <= $end_datetime GROUP BY time ORDER BY time ASC",
            "legend": "Completion Tokens",
            "disabled": False
          },
          {
            "name": "C",
            "query": "SELECT toStartOfInterval(timestamp, INTERVAL 1 MINUTE) as time, sum(attributes_number['llm.usage.total_tokens']) as value FROM signoz_traces.distributed_signoz_index_v3 WHERE serviceName = 'rudraone-backend' AND mapContains(attributes_number, 'llm.usage.total_tokens') AND timestamp >= $start_datetime AND timestamp <= $end_datetime GROUP BY time ORDER BY time ASC",
            "legend": "Total Tokens",
            "disabled": False
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
            "disabled": False
          }
        ]
      }
    }
  ]
}

async def seed_signoz_metadata():
    logger.info("📡 Checking SigNoz metastore database connection for autoseed...")
    try:
        # Use a short timeout of 5 seconds to avoid locking up startup if SigNoz is not deployed
        conn = await asyncpg.connect(SIGNOZ_METASTORE_URL, timeout=5)
    except Exception as e:
        logger.warning("⚠️ SigNoz metastore database not reachable: %s (skipping SigNoz autoseed)", e)
        return

    try:
        # 1. Fetch organization ID
        org = await conn.fetchrow("SELECT id FROM organizations LIMIT 1;")
        if not org:
            logger.warning("⚠️ No organizations found in SigNoz metastore (skipping seed)")
            return
        org_id = org['id']

        # 2. Fetch admin user (or first user) to act as creator
        user = await conn.fetchrow("SELECT id FROM users LIMIT 1;")
        if not user:
            logger.warning("⚠️ No users found in SigNoz metastore (skipping seed)")
            return
        user_id = user['id']

        # 3. Seed Service Account
        sa_id = "019f5a92-3fd1-762b-b1e1-10a09b4cd6a4"
        sa = await conn.fetchrow("SELECT id FROM service_account WHERE id = $1;", sa_id)
        if not sa:
            await conn.execute(
                "INSERT INTO service_account (id, name, email, status, created_at, updated_at, org_id) "
                "VALUES ($1, 'agent', 'agent@signozserviceaccount.com', 'active', now(), now(), $2);",
                sa_id, org_id
            )
            logger.info("✅ Seeded SigNoz Service Account: agent")

        # 4. Seed Service Account Admin Role Binding
        binding_id = "019f5a92-3fd1-762b-b1e1-10a09b4cd6a4-role"
        binding = await conn.fetchrow("SELECT id FROM service_account_role WHERE id = $1;", binding_id)
        if not binding:
            # Query role id for signoz-admin
            role = await conn.fetchrow("SELECT id FROM role WHERE name = 'signoz-admin' AND org_id = $1;", org_id)
            if role:
                await conn.execute(
                    "INSERT INTO service_account_role (id, created_at, updated_at, service_account_id, role_id) "
                    "VALUES ($1, now(), now(), $2, $3);",
                    binding_id, sa_id, role['id']
                )
                logger.info("✅ Bound agent Service Account to role: signoz-admin")

        # 5. Seed API Key
        key_id = "019f5a92-9370-7af9-9b79-2b1fbff81c33"
        api_key = "4mrgKQQF31otQfn80EP49e3I2DCKRP/HgHy9/+T5aZs="
        key_row = await conn.fetchrow("SELECT id FROM factor_api_key WHERE id = $1;", key_id)
        if not key_row:
            await conn.execute(
                "INSERT INTO factor_api_key (id, name, key, created_at, updated_at, expires_at, last_observed_at, service_account_id) "
                "VALUES ($1, 'rudraone', $2, now(), now(), 0, now(), $3);",
                key_id, api_key, sa_id
            )
            logger.info("✅ Seeded SigNoz API Key")

        # 6. Seed Dashboard
        dashboard_id = "019f5a94-8617-7b7d-bc8c-e19f1ee892d0"
        dashboard = await conn.fetchrow("SELECT id FROM dashboard WHERE id = $1;", dashboard_id)
        if not dashboard:
            # Delete any duplicate named dashboards to avoid clutter
            await conn.execute("DELETE FROM dashboard WHERE name = 'RudraOne AI Agent & APM Monitor';")
            
            data_json = json.dumps(DASHBOARD_DATA)
            await conn.execute(
                "INSERT INTO dashboard (id, created_at, updated_at, created_by, updated_by, data, locked, org_id, source, name) "
                "VALUES ($1, now(), now(), $2, $2, $3, false, $4, 'user', 'RudraOne AI Agent & APM Monitor');",
                dashboard_id, user_id, data_json, org_id
            )
            logger.info("✅ Seeded SigNoz Dashboard: RudraOne AI Agent & APM Monitor")

    except Exception as e:
        logger.error("❌ Failed to seed SigNoz metadata: %s", e)
    finally:
        await conn.close()
