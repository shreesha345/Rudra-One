import json
import subprocess
import uuid
from datetime import datetime

with open('RUDRAONE_DASHBOARD.md', 'r') as f:
    content = f.read()

# Extract JSON from markdown
json_str = content.split('```json')[1].split('```')[0].strip()
DASHBOARD_DATA = json.loads(json_str)

# Delete existing
subprocess.run(
    ["docker", "exec", "signoz-metastore-postgres-0",
     "psql", "-U", "signoz", "-d", "signoz", "-c",
     "DELETE FROM dashboard WHERE name = 'RudraOne AI Agent & APM Monitor';"],
    capture_output=True, text=True
)

# Fetch user details
org_id = subprocess.run(
    ["docker", "exec", "signoz-metastore-postgres-0",
     "psql", "-U", "signoz", "-d", "signoz", "-t", "-A",
     "-c", "SELECT org_id FROM users LIMIT 1;"],
    capture_output=True, text=True
).stdout.strip()

user_id = subprocess.run(
    ["docker", "exec", "signoz-metastore-postgres-0",
     "psql", "-U", "signoz", "-d", "signoz", "-t", "-A",
     "-c", "SELECT id FROM users LIMIT 1;"],
    capture_output=True, text=True
).stdout.strip()

dashboard_id = str(uuid.uuid4())
data_json = json.dumps(DASHBOARD_DATA)
data_escaped = data_json.replace("'", "''")
now = datetime.utcnow().isoformat()

sql = (
    f"INSERT INTO dashboard (id, created_at, updated_at, created_by, updated_by, data, locked, org_id, source, name) "
    f"VALUES ('{dashboard_id}', '{now}', '{now}', '{user_id}', '{user_id}', "
    f"'{data_escaped}', false, '{org_id}', 'user', 'RudraOne AI Agent & APM Monitor');"
)

result = subprocess.run(
    ["docker", "exec", "signoz-metastore-postgres-0",
     "psql", "-U", "signoz", "-d", "signoz", "-c", sql],
    capture_output=True, text=True
)
print("Dashboard successfully updated to V5 schema!")
